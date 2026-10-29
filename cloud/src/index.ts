import { DurableObject } from 'cloudflare:workers';
import { timingSafeEqual } from 'node:crypto';
import { Reader, Writer, WireError, OP, MAX_PACKET, hex, unhex, displayName, parseCreate, encodeRooms, welcome, joined, parseSend, data } from './protocol.mjs';

type Description = { app: string; name: string; flags: number; reserved: number[] };
type PublicRoom = Description & { id: string; count: number; revision: number; expires: number };
type Metadata = Description & { id: string; tokenHash: string; created: number; lastHostSeen: number; lastPublished: number; revision: number; ended: boolean };
type Player = { id: number; name: string; role: 'host' | 'guest'; window: number; messages: number; bytes: number };
type StoredRoom = { id: string; payload: string; revision: number; expires: number };
const LEASE = 180_000;

function binary(bytes: Uint8Array, status = 200): Response {
  return new Response(Uint8Array.from(bytes).buffer, { status, headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
function problem(status: number, message: string): Response {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}
async function limitedBody(request: Request, limit: number): Promise<Uint8Array> {
  if (Number(request.headers.get('Content-Length') ?? 0) > limit) throw new WireError('Request is too large');
  const reader = request.body?.getReader();
  if (!reader) throw new WireError('Missing request body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new WireError('Request is too large'); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
async function digest(value: Uint8Array): Promise<string> { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(value).buffer))); }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname !== '/health') {
        url.protocol = 'https:';
        return Response.redirect(url.href, 308);
      }
      if (url.pathname === '/health' && request.method === 'GET') return Response.json({ service: 'joey-online-rooms', protocol: 1 });
      if (url.pathname === '/v1/rooms' && request.method === 'GET') {
        const app = url.searchParams.get('app') ?? '';
        if (!/^[a-f0-9]{32}$/.test(app)) return problem(400, 'Invalid game identifier');
        return binary(encodeRooms(await env.DIRECTORY.getByName(app).list()));
      }
      if (url.pathname === '/v1/rooms' && request.method === 'POST') {
        const description = parseCreate(await limitedBody(request, 9000));
        const directory = env.DIRECTORY.getByName(description.app);
        const created = await directory.create(description);
        if (!created) return problem(429, 'Lobby capacity reached; try again later');
        return binary(new Writer().raw(unhex(created.id)).raw(unhex(created.token)).finish(), 201);
      }
      const match = /^\/v1\/rooms\/([a-f0-9]{32})\/play$/.exec(url.pathname);
      if (match && request.method === 'GET') {
        if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return problem(426, 'WebSocket required');
        return await env.MATCH.getByName(match[1]).fetch(request);
      }
      return problem(404, 'Not found');
    } catch (error) {
      if (error instanceof WireError || error instanceof TypeError || error instanceof RangeError) return problem(400, error.message);
      console.error(JSON.stringify({ event: 'request_failed', path: url.pathname }));
      return problem(503, 'Lobby temporarily unavailable');
    }
  }
} satisfies ExportedHandler<Env>;

// One directory coordinates a single game's room listings; duel traffic goes to separate objects.
export class RoomDirectory extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, payload TEXT NOT NULL, revision INTEGER NOT NULL, expires INTEGER NOT NULL)');
    this.ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS rooms_expiry ON rooms(expires)');
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS admission (minute INTEGER PRIMARY KEY, count INTEGER NOT NULL)');
  }
  async create(description: Description): Promise<{ id: string; token: string } | null> {
    const now = Date.now();
    const minute = Math.floor(now / 60_000);
    this.ctx.storage.sql.exec('DELETE FROM rooms WHERE expires < ?', now);
    this.ctx.storage.sql.exec('DELETE FROM admission WHERE minute < ?', minute);
    const count = this.ctx.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM rooms').one().count;
    const recent = this.ctx.storage.sql.exec<{ count: number }>('SELECT count FROM admission WHERE minute = ?', minute).toArray()[0]?.count ?? 0;
    if (count >= 100 || recent >= 20) return null;
    const id = crypto.randomUUID().replaceAll('-', '');
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    this.ctx.storage.sql.exec('INSERT INTO admission (minute, count) VALUES (?, 1) ON CONFLICT(minute) DO UPDATE SET count = count + 1', minute);
    const room: PublicRoom = { ...description, id, count: 0, revision: 0, expires: now + LEASE };
    this.ctx.storage.sql.exec('INSERT INTO rooms (id,payload,revision,expires) VALUES (?,?,?,?)', id, JSON.stringify(room), 0, room.expires);
    try {
      await this.env.MATCH.getByName(id).initialize({ ...description, id, tokenHash: await digest(unhex(token)), created: now, lastHostSeen: now, lastPublished: 0, revision: 0, ended: false });
    } catch (error) {
      this.ctx.storage.sql.exec('DELETE FROM rooms WHERE id = ?', id);
      throw error;
    }
    return { id, token };
  }
  list(): PublicRoom[] {
    return this.ctx.storage.sql.exec<StoredRoom>('SELECT id,payload,revision,expires FROM rooms WHERE expires > ? ORDER BY id LIMIT 100', Date.now())
      .toArray().map(row => JSON.parse(row.payload) as PublicRoom).filter(room => room.count > 0);
  }
  publish(room: PublicRoom): void {
    this.ctx.storage.sql.exec('UPDATE rooms SET payload=?,revision=?,expires=? WHERE id=? AND revision<=?', JSON.stringify(room), room.revision, room.expires, room.id, room.revision);
  }
  remove(id: string): void { this.ctx.storage.sql.exec('DELETE FROM rooms WHERE id=?', id); }
}

export class DuelRoom extends DurableObject<Env> {
  async initialize(meta: Metadata): Promise<void> {
    if (await this.ctx.storage.get('meta')) throw new Error('Room already exists');
    await this.ctx.storage.put('meta', meta);
    await this.ctx.storage.setAlarm(Date.now() + LEASE);
  }
  private players(): WebSocket[] { return this.ctx.getWebSockets().filter(socket => socket.readyState === WebSocket.OPEN); }
  private player(socket: WebSocket): Player { return socket.deserializeAttachment() as Player; }
  private async publish(meta: Metadata): Promise<void> {
    meta.revision++;
    meta.lastPublished = Date.now();
    await this.ctx.storage.put('meta', meta);
    const room: PublicRoom = { app: meta.app, id: meta.id, name: meta.name, flags: meta.flags, reserved: meta.reserved,
      count: this.players().length, revision: meta.revision, expires: Date.now() + LEASE };
    await this.env.DIRECTORY.getByName(meta.app).publish(room);
  }
  async fetch(request: Request): Promise<Response> {
    let meta = await this.ctx.storage.get<Metadata>('meta');
    if (!meta || meta.ended || Date.now() - meta.lastHostSeen > LEASE) return problem(410, 'Room has closed');
    const url = new URL(request.url);
    const role = url.searchParams.get('role');
    if (role !== 'host' && role !== 'guest') return problem(400, 'Invalid player role');
    const name = displayName(url.searchParams.get('name'), 64);
    if (role === 'host') {
      const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
      if (!/^[a-f0-9]{64}$/.test(token)) return problem(403, 'Invalid host credential');
      const actual = unhex(await digest(unhex(token)));
      const expected = unhex(meta.tokenHash);
      if (!timingSafeEqual(actual, expected)) return problem(403, 'Invalid host credential');
    }
    // All external awaits happen above the final capacity check and synchronous acceptance.
    meta = await this.ctx.storage.get<Metadata>('meta');
    if (!meta || meta.ended || Date.now() - meta.lastHostSeen > LEASE) return problem(410, 'Room has closed');
    const existing = this.players();
    if (existing.some(socket => this.player(socket).role === role) || existing.length >= 2) return problem(409, 'Room is full');
    if (role === 'guest' && !existing.some(socket => this.player(socket).role === 'host')) return problem(409, 'Host is not ready');
    const pair = new WebSocketPair();
    const socket = pair[1];
    const player: Player = { id: role === 'host' ? 1 : 2, role, name, window: Date.now(), messages: 0, bytes: 0 };
    socket.serializeAttachment(player);
    this.ctx.acceptWebSocket(socket, [role]);
    socket.send(welcome(player.id, [...existing.map(other => this.player(other)), player]));
    for (const other of existing) other.send(joined(player));
    if (role === 'host') meta.lastHostSeen = Date.now();
    await this.publish(meta);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      if (typeof message === 'string' || message.byteLength > MAX_PACKET) throw new WireError('Binary packet required');
      const player = this.player(socket);
      const now = Date.now();
      if (now - player.window >= 1000) { player.window = now; player.messages = 0; player.bytes = 0; }
      player.messages++;
      player.bytes += message.byteLength;
      if (player.messages > 120 || player.bytes > 1_048_576) { socket.close(1008, 'Rate limit'); return; }
      socket.serializeAttachment(player);
      const bytes = new Uint8Array(message);
      if (bytes.length === 1 && bytes[0] === OP.HEARTBEAT) {
        socket.send(Uint8Array.of(OP.PONG));
      } else {
        const packet = parseSend(bytes);
        const frame = data(player.id, packet.payload);
        // Sender identity comes from the connection, never from client-supplied bytes.
        for (const other of this.players()) {
          const recipient = this.player(other);
          if (recipient.id === player.id) continue; // Local loopback is handled by the game-side adapter.
          if (packet.target === 0 || packet.target === recipient.id) other.send(frame);
        }
      }
      if (player.role === 'host') {
        const meta = await this.ctx.storage.get<Metadata>('meta');
        if (meta && !meta.ended && now - meta.lastPublished >= 45_000) {
          meta.lastHostSeen = now;
          await this.publish(meta);
          await this.ctx.storage.setAlarm(now + LEASE);
        }
      }
    } catch (error) {
      if (error instanceof WireError) socket.close(1008, 'Invalid game packet');
      else { console.error(JSON.stringify({ event: 'relay_failed' })); socket.close(1011, 'Relay unavailable'); }
    }
  }
  private async end(excluding?: WebSocket): Promise<void> {
    const meta = await this.ctx.storage.get<Metadata>('meta');
    if (!meta || meta.ended) return;
    meta.ended = true;
    await this.ctx.storage.put('meta', meta);
    for (const socket of this.players()) {
      if (socket === excluding) continue;
      socket.send(new Writer().u8(OP.LEFT).u32(excluding ? this.player(excluding).id : 1).finish());
      socket.close(1000, 'Duel ended');
    }
    await this.env.DIRECTORY.getByName(meta.app).remove(meta.id);
    await this.ctx.storage.setAlarm(Date.now() + LEASE);
  }
  async webSocketClose(socket: WebSocket): Promise<void> { await this.end(socket); }
  async webSocketError(socket: WebSocket): Promise<void> { await this.end(socket); }
  async alarm(): Promise<void> {
    const meta = await this.ctx.storage.get<Metadata>('meta');
    if (!meta) return;
    if (meta.ended) { await this.ctx.storage.deleteAll(); return; }
    if (Date.now() - meta.lastHostSeen >= LEASE) { await this.end(); return; }
    await this.ctx.storage.setAlarm(meta.lastHostSeen + LEASE);
  }
}

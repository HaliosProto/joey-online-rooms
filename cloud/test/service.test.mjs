import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import WebSocket from 'ws';
import { Writer, Reader, OP, hex, unhex } from '../src/protocol.mjs';

const base = process.env.TEST_SERVER;
const sockets = new Set();
after(() => { for (const socket of sockets) socket.terminate(); });
const app = hex(randomBytes(16));
async function create(name = 'Service validation') {
  const bytes = new Writer().raw(Uint8Array.of(74,89,82,49)).raw(unhex(app)).u32(0).text(name).blob(Uint8Array.of(4,5)).finish();
  const response = await fetch(`${base}/v1/rooms`, { method: 'POST', body: bytes });
  assert.equal(response.status, 201);
  const reader = new Reader(await response.arrayBuffer());
  const result = { id: hex(reader.take(16)), token: hex(reader.take(32)) }; reader.end(); return result;
}
function client(room, role, name, token) {
  const url = new URL(`${base}/v1/rooms/${room}/play`); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('role', role); url.searchParams.set('name', name);
  const ws = new WebSocket(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  sockets.add(ws);
  const inbox = [], waiters = [];
  ws.on('message', bytes => { const frame = new Uint8Array(bytes); const waiter = waiters.shift(); if (waiter) waiter.resolve(frame); else inbox.push(frame); });
  const opened = new Promise((resolve, reject) => {
    ws.once('open', resolve); ws.once('error', reject);
    ws.once('unexpected-response', (_, response) => { response.resume(); reject(Object.assign(new Error(`HTTP ${response.statusCode}`), { status: response.statusCode })); });
  });
  const next = () => inbox.length ? Promise.resolve(inbox.shift()) : new Promise((resolve, reject) => {
    const entry = { resolve: value => { clearTimeout(timeout); resolve(value); }, reject };
    const timeout = setTimeout(() => { const index = waiters.indexOf(entry); if (index >= 0) waiters.splice(index, 1); reject(new Error('Timed out waiting for relay frame')); }, 5000);
    waiters.push(entry);
  });
  return { ws, opened, next };
}
async function listings() {
  const response = await fetch(`${base}/v1/rooms?app=${app}`); assert.equal(response.status, 200);
  const reader = new Reader(await response.arrayBuffer()); const count = reader.u32(); const result = [];
  for (let i = 0; i < count; i++) result.push({ id: hex(reader.take(16)), app: hex(reader.take(16)), flags: reader.u32(), maximum: reader.u32(), count: reader.u32(), name: reader.text(), reserved: [...reader.blob()] });
  reader.end(); return result;
}

test('live cloud contract: room visibility, credentials, capacity, isolation and disconnect', { skip: !base, timeout: 30000 }, async () => {
  const first = await create();
  assert.equal((await listings()).length, 0, 'an unconnected host must not advertise a stale room');
  const forged = client(first.id, 'host', 'Impostor', '0'.repeat(64));
  await assert.rejects(forged.opened, error => error.status === 403);
  const host = client(first.id, 'host', 'Host', first.token); await host.opened;
  assert.equal((await host.next())[0], OP.WELCOME);
  const list = await listings(); assert.equal(list.length, 1); assert.equal(list[0].id, first.id); assert.equal(list[0].count, 1); assert.deepEqual(list[0].reserved, [4,5]);
  const guest = client(first.id, 'guest', 'Friend'); await guest.opened;
  const greeting = new Reader(await guest.next()); assert.equal(greeting.u8(), OP.WELCOME); assert.equal(greeting.u32(), 2);
  assert.equal((await host.next())[0], OP.JOINED);
  const third = client(first.id, 'guest', 'Third'); await assert.rejects(third.opened, error => error.status === 409);
  const payload = Uint8Array.of(255,0,1,128,42);
  guest.ws.send(new Writer().u8(OP.SEND).u32(1).u32(8).raw(payload).finish());
  const relayed = new Reader(await host.next()); assert.equal(relayed.u8(), OP.DATA); assert.equal(relayed.u32(), 2); assert.deepEqual(relayed.take(payload.length), payload); relayed.end();
  const second = await create('Isolated room'); const other = client(second.id, 'host', 'Other host', second.token); await other.opened; await other.next();
  guest.ws.send(new Writer().u8(OP.SEND).u32(0).u32(8).raw(payload).finish());
  assert.equal((await host.next())[0], OP.DATA);
  other.ws.send(Uint8Array.of(OP.HEARTBEAT)); assert.equal((await other.next())[0], OP.PONG, 'another room must not receive duel payloads');
  guest.ws.close(); assert.equal((await host.next())[0], OP.LEFT);
  // Closing a duel removes its room; a separate room remains available.
  for (let i = 0; i < 20; i++) { if (!(await listings()).some(room => room.id === first.id)) break; await new Promise(resolve => setTimeout(resolve, 50)); }
  assert.deepEqual((await listings()).map(room => room.id), [second.id]);
  other.ws.close();
});

test('HTTP input is bounded and malformed identifiers are rejected', { skip: !base }, async () => {
  assert.equal((await fetch(`${base}/v1/rooms?app=invalid`)).status, 400);
  assert.equal((await fetch(`${base}/v1/rooms`, { method: 'POST', body: new Uint8Array(9001) })).status, 400);
  assert.equal((await fetch(`${base}/v1/rooms`, { method: 'POST', body: new Uint8Array(2) })).status, 400);
});

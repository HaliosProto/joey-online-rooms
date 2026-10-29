// Version 1: little-endian fields; strings are length-prefixed UTF-16LE.
export const MAX_PACKET = 65545;
export const OP = Object.freeze({ SEND: 16, HEARTBEAT: 17, WELCOME: 128, JOINED: 129, DATA: 130, LEFT: 131, PONG: 132 });
export class WireError extends Error {}

export class Reader {
  constructor(bytes) {
    this.bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    this.offset = 0;
  }
  take(size) {
    if (!Number.isInteger(size) || size < 0 || this.offset + size > this.bytes.length) throw new WireError('Truncated packet');
    const result = this.bytes.slice(this.offset, this.offset + size);
    this.offset += size;
    return result;
  }
  u8() { return this.take(1)[0]; }
  u16() { const p = this.offset; this.take(2); return this.view.getUint16(p, true); }
  u32() { const p = this.offset; this.take(4); return this.view.getUint32(p, true); }
  text(limit = 128) {
    const count = this.u16();
    if (count > limit) throw new WireError('Text is too long');
    return new TextDecoder('utf-16le', { fatal: true }).decode(this.take(count * 2));
  }
  blob(limit = 8192) { const count = this.u32(); if (count > limit) throw new WireError('Data is too large'); return this.take(count); }
  end() { if (this.offset !== this.bytes.length) throw new WireError('Unexpected trailing data'); }
}

export class Writer {
  constructor() { this.parts = []; }
  raw(value) { this.parts.push(new Uint8Array(value)); return this; }
  u8(value) { return this.raw(Uint8Array.of(value)); }
  u16(value) { const bytes = new Uint8Array(2); new DataView(bytes.buffer).setUint16(0, value, true); return this.raw(bytes); }
  u32(value) { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value, true); return this.raw(bytes); }
  text(value) {
    if (value.length > 65535) throw new WireError('Text is too long');
    const bytes = new Uint8Array(value.length * 2);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < value.length; i++) view.setUint16(i * 2, value.charCodeAt(i), true);
    return this.u16(value.length).raw(bytes);
  }
  blob(value) { return this.u32(value.length).raw(value); }
  finish() {
    const result = new Uint8Array(this.parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of this.parts) { result.set(part, offset); offset += part.length; }
    return result;
  }
}

export function hex(bytes) { return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join(''); }
export function unhex(value) {
  if (typeof value !== 'string' || !/^(?:[a-f0-9]{2})+$/.test(value)) throw new WireError('Invalid identifier');
  return Uint8Array.from(value.match(/../g), byte => parseInt(byte, 16));
}
export function displayName(value, limit = 64) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || /[\x00-\x1f\x7f]/.test(value)) throw new WireError('Invalid display name');
  return value.trim();
}
export function parseCreate(bytes) {
  const reader = new Reader(bytes);
  if (hex(reader.take(4)) !== '4a595231') throw new WireError('Unsupported protocol');
  const app = hex(reader.take(16));
  const flags = reader.u32();
  const name = displayName(reader.text(64));
  const reserved = Array.from(reader.blob());
  reader.end();
  // Password-protected DirectPlay sessions need an explicit protocol extension.
  if (flags & 128) throw new WireError('Password-protected sessions are not supported');
  return { app, flags, name, reserved };
}
export function encodeRooms(rooms) {
  const writer = new Writer().u32(rooms.length);
  for (const room of rooms) writer.raw(unhex(room.id)).raw(unhex(room.app)).u32(room.flags)
    .u32(2).u32(room.count).text(room.name).blob(Uint8Array.from(room.reserved));
  return writer.finish();
}
export function playerRecord(writer, player) { return writer.u32(player.id).text(player.name); }
export function welcome(id, players) {
  const writer = new Writer().u8(OP.WELCOME).u32(id).u32(1).u8(players.length);
  for (const player of players) playerRecord(writer, player);
  return writer.finish();
}
export function joined(player) { return playerRecord(new Writer().u8(OP.JOINED), player).finish(); }
export function parseSend(bytes) {
  if (bytes.byteLength > MAX_PACKET) throw new WireError('Packet is too large');
  const reader = new Reader(bytes);
  if (reader.u8() !== OP.SEND) throw new WireError('Unexpected packet type');
  const target = reader.u32();
  const flags = reader.u32();
  if (![0, 1, 2].includes(target)) throw new WireError('Invalid recipient');
  return { target, flags, payload: reader.take(reader.bytes.length - reader.offset) };
}
export function data(sender, payload) { return new Writer().u8(OP.DATA).u32(sender).raw(payload).finish(); }

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Writer, Reader, WireError, OP, parseCreate, parseSend, encodeRooms, welcome, data, hex } from '../src/protocol.mjs';

test('game names and opaque duel bytes survive the wire format', () => {
  const bytes = new Writer().raw(Uint8Array.of(74, 89, 82, 49)).raw(new Uint8Array(16)).u32(0).text('Friends — دوستان').blob(Uint8Array.of(0, 255, 1)).finish();
  const room = parseCreate(bytes);
  assert.equal(room.name, 'Friends — دوستان');
  assert.deepEqual(room.reserved, [0, 255, 1]);
  assert.equal(room.app, '0'.repeat(32));
});
test('malformed and oversized requests are rejected', () => {
  assert.throws(() => parseCreate(new Uint8Array(3)), WireError);
  assert.throws(() => new Reader(Uint8Array.of(255, 255)).text(64), WireError);
  assert.throws(() => parseSend(new Writer().u8(OP.SEND).u32(999).u32(0).finish()), WireError);
  assert.throws(() => parseSend(new Uint8Array(65546)), WireError);
});
test('room listings contain the session GUID, capacity and reserved data', () => {
  const reader = new Reader(encodeRooms([{ id: '1'.repeat(32), app: '2'.repeat(32), flags: 0, count: 1, name: 'Duel', reserved: [4, 5] }]));
  assert.equal(reader.u32(), 1);
  assert.equal(hex(reader.take(16)), '1'.repeat(32));
  assert.equal(hex(reader.take(16)), '2'.repeat(32));
  assert.equal(reader.u32(), 0);
  assert.equal(reader.u32(), 2);
  assert.equal(reader.u32(), 1);
  assert.equal(reader.text(), 'Duel');
  assert.deepEqual([...reader.blob()], [4, 5]);
  reader.end();
});
test('welcome identifies local and host players independently', () => {
  const reader = new Reader(welcome(2, [{ id: 1, name: 'Host' }, { id: 2, name: 'Friend' }]));
  assert.equal(reader.u8(), OP.WELCOME);
  assert.equal(reader.u32(), 2);
  assert.equal(reader.u32(), 1);
  assert.equal(reader.u8(), 2);
  assert.equal(reader.u32(), 1); assert.equal(reader.text(), 'Host');
  assert.equal(reader.u32(), 2); assert.equal(reader.text(), 'Friend');
  reader.end();
});
test('relay prepends server-authoritative sender ID without altering payload', () => {
  const payload = Uint8Array.of(2, 0, 128, 255, 4, 5);
  const sent = parseSend(new Writer().u8(OP.SEND).u32(1).u32(8).raw(payload).finish());
  assert.deepEqual(sent.payload, payload);
  const received = new Reader(data(2, sent.payload));
  assert.equal(received.u8(), OP.DATA);
  assert.equal(received.u32(), 2);
  assert.deepEqual(received.take(payload.length), payload);
  received.end();
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import './room-transport.js';
const encode=new TextEncoder(),decode=new TextDecoder();
function fixture(platform={}) {
  const heap=new Uint8Array(1048576);const notifications=[];let next=0;
  const api={heap:()=>heap,allocateSocket:()=>++next,setEvents:(...args)=>notifications.push(args)};
  const transport=globalThis.createJoeyRoomTransport(api,'https://rooms.example',platform);
  const socket=()=>{const id=transport.socket(2,1,0);assert.equal(transport.connect(id,0x0100007f,80),0);return id;};
  const send=(id,value)=>{const bytes=typeof value==='string'?encode.encode(value):value;heap.set(bytes,0);return transport.send(id,0,bytes.length);};
  const recv=(id,limit=65536,flags=0)=>{const n=transport.recv(id,0,limit,flags);return n>=0?heap.slice(0,n):n;};
  return {transport,socket,send,recv,heap,notifications};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('virtual sockets reject internet destinations and UDP',()=>{
 const f=fixture();assert.equal(f.transport.socket(2,2,0),-97);
 const id=f.transport.socket(2,1,0);assert.equal(f.transport.connect(id,0x08080808,80),-101);
 assert.equal(f.transport.connect(id,0x0100007f,443),-101);
});
test('split HTTP requests preserve binary bodies and buffered peek/read behavior',async()=>{
 let seen;
 const f=fixture({fetch:async(url,opts)=>{seen={url,opts};return new Response(Uint8Array.of(0,128,255),{status:201});}});
 const id=f.socket();
 f.send(id,'POST /v1/rooms HTTP/1.1\r\nContent-Length: 3\r\n');
 assert.equal(f.recv(id),-11);
 f.send(id,encode.encode('\r\n').map(n=>n));f.send(id,Uint8Array.of(1,0,255));
 await tick();await tick();
 assert.equal(seen.url,'https://rooms.example/v1/rooms');
 assert.deepEqual(seen.opts.body,Uint8Array.of(1,0,255));
 assert.equal(seen.opts.credentials,'omit');
 const peek=f.recv(id,12,2),normal=f.recv(id,12);assert.deepEqual(normal,peek);
 const rest=f.recv(id);assert.deepEqual(rest.slice(-3),Uint8Array.of(0,128,255));
 assert.equal(f.recv(id).length,0);
});
test('virtual HTTP requests cannot fetch arbitrary URLs or overflow request buffers',async()=>{
 let calls=0;const f=fixture({fetch:async()=>{calls++;return new Response();}});
 const id=f.socket();f.send(id,'GET //unrelated.example/ HTTP/1.1\r\n\r\n');await tick();
 assert.equal(calls,0);assert.match(decode.decode(f.recv(id)),/502/);
 const other=f.socket();f.send(other,'POST /v1/rooms HTTP/1.1\r\nContent-Length: 9001\r\n\r\n');
 assert.equal(f.transport.getError(other),104);
});
test('WebSocket facade bridges host credentials, masking, fragments and close handshake',async()=>{
 let ws;
 class FakeSocket {
  constructor(url,protocols){this.url=url;this.protocols=protocols;this.sent=[];this.bufferedAmount=0;ws=this;}
  send(bytes){this.sent.push(bytes);}
  close(code){this.code=code;this.onclose?.({wasClean:true});}
 }
 const f=fixture({WebSocket:FakeSocket,crypto:globalThis.crypto});const id=f.socket();
 f.send(id,'GET /v1/rooms/'+'a'.repeat(32)+'/play?role=host&name=Host HTTP/1.1\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nAuthorization: Bearer '+'b'.repeat(64)+'\r\n\r\n');
 for(let i=0;i<50&&!ws;i++)await new Promise(r=>setTimeout(r,2));
 assert.ok(ws);assert.equal(ws.url,'wss://rooms.example/v1/rooms/'+'a'.repeat(32)+'/play?role=host&name=Host');
 assert.equal(ws.protocols[1],'joey-auth.'+'b'.repeat(64));ws.onopen();
 assert.match(decode.decode(f.recv(id)),/Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK\+xOo=/);
 const masked=(op,data,final=true)=>{const a=Uint8Array.of((final?128:0)|op,128|data.length,1,2,3,4,...data.map((n,i)=>n^([1,2,3,4][i%4])));return a;};
 f.send(id,masked(2,[0,128],false));f.send(id,masked(0,[255],true));assert.deepEqual(ws.sent[0],Uint8Array.of(0,128,255));
 ws.onmessage({data:Uint8Array.of(42,0).buffer});assert.deepEqual(f.recv(id),Uint8Array.of(130,2,42,0));
 f.send(id,masked(8,[3,232]));assert.equal(ws.code,1000);assert.deepEqual(f.recv(id),Uint8Array.of(136,2,3,232));
 assert.equal(f.recv(id).length,0);
});

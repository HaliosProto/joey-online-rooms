import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { Writer, Reader, OP, hex, unhex } from '../cloud/src/protocol.mjs';
import './room-transport.js';
const WebSocket=createRequire(new URL('../cloud/package.json',import.meta.url))('ws');
const base=process.env.TEST_SERVER;
const origin='https://haliosproto.github.io';
const enc=new TextEncoder(),dec=new TextDecoder();
const pause=()=>new Promise(r=>setTimeout(r,5));

test('browser virtual sockets interoperate with a native-protocol guest on the real Worker', {skip:!base,timeout:30000},async()=>{
 const heap=new Uint8Array(1048576);let sequence=0;
 class BrowserSocket extends WebSocket {constructor(url,protocols){super(url,protocols,{origin});}}
 const transport=globalThis.createJoeyRoomTransport({heap:()=>heap,allocateSocket:()=>++sequence,setEvents(){}},base,{
  crypto:globalThis.crypto,WebSocket:BrowserSocket,
  fetch:async(url,options)=>{
   const result=await fetch(url,{...options,headers:{...options.headers,Origin:origin}});
   assert.equal(result.headers.get('Access-Control-Allow-Origin'),origin);return result;
  }
 });
 const ids=[];let guest;
 function socket(){const id=transport.socket(2,1,0);ids.push(id);assert.equal(transport.connect(id,0x7f000001,80),0);return id;}
 function send(id,bytes){if(typeof bytes==='string')bytes=enc.encode(bytes);heap.set(bytes);assert.equal(transport.send(id,0,bytes.length),bytes.length);}
 function receive(id){const count=transport.recv(id,0,65536,0);if(count===-11)return null;if(count<0)throw new Error('Virtual socket error '+count);return heap.slice(0,count);}
 function concat(a,b){const out=new Uint8Array(a.length+b.length);out.set(a);out.set(b,a.length);return out;}
 async function response(id){let bytes=new Uint8Array();const until=Date.now()+8000;
  while(Date.now()<until){const next=receive(id);if(next)bytes=concat(bytes,next);const cut=dec.decode(bytes).indexOf('\r\n\r\n');
   if(cut>=0){const header=dec.decode(bytes.subarray(0,cut));const status=Number(header.split(' ')[1]);const size=Number(/Content-Length: (\d+)/i.exec(header)?.[1]||0);if(bytes.length>=cut+4+size)return{status,body:bytes.slice(cut+4,cut+4+size),rest:bytes.slice(cut+4+size)};}
   await pause();
  }throw new Error('Virtual HTTP response timed out');
 }
 function masked(op,payload){const n=payload.length;assert.ok(n<126);const out=new Uint8Array(n+6);out.set([128|op,128|n,1,2,3,4]);for(let i=0;i<n;i++)out[6+i]=payload[i]^([1,2,3,4][i%4]);return out;}
 let pending=new Uint8Array();
 async function frame(id){const until=Date.now()+8000;while(Date.now()<until){
  if(pending.length>=2){let n=pending[1]&127,at=2;if(n===126){if(pending.length<4){await pause();continue;}n=new DataView(pending.buffer,pending.byteOffset).getUint16(2);at=4;}assert.notEqual(n,127);
   if(pending.length>=at+n){const result={op:pending[0]&15,bytes:pending.slice(at,at+n)};pending=pending.slice(at+n);return result;}}
  const next=receive(id);if(next)pending=concat(pending,next);await pause();
 }throw new Error('Virtual WebSocket frame timed out');}
 const app=hex(randomBytes(16));
 try{
  const bytes=new Writer().raw(Uint8Array.of(74,89,82,49)).raw(unhex(app)).u32(0).text('Browser bridge check').blob(new Uint8Array()).finish();
  const create=socket();send(create,`POST /v1/rooms HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/octet-stream\r\nContent-Length: ${bytes.length}\r\n\r\n`);send(create,bytes);
  const created=await response(create);assert.equal(created.status,201);
  const info=new Reader(created.body),room=hex(info.take(16)),token=hex(info.take(32));
  const host=socket();send(host,`GET /v1/rooms/${room}/play?role=host&name=Browser HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\nAuthorization: Bearer ${token}\r\n\r\n`);
  const upgrade=await response(host);assert.equal(upgrade.status,101);pending=upgrade.rest;
  assert.equal((await frame(host)).bytes[0],OP.WELCOME);
  const inbox=[];guest=new WebSocket(`${base.replace(/^http/,'ws')}/v1/rooms/${room}/play?role=guest&name=Native`);
  guest.on('message',b=>inbox.push(new Uint8Array(b)));
  await new Promise((resolve,reject)=>{guest.once('open',resolve);guest.once('error',reject);});
  assert.equal((await frame(host)).bytes[0],OP.JOINED);
  const payload=Uint8Array.of(0,128,255,42);
  send(host,masked(2,new Writer().u8(OP.SEND).u32(2).u32(8).raw(payload).finish()));
  const until=Date.now()+5000;while(!inbox.some(b=>b[0]===OP.DATA)&&Date.now()<until)await pause();
  const toGuest=new Reader(inbox.find(b=>b[0]===OP.DATA));assert.equal(toGuest.u8(),OP.DATA);assert.equal(toGuest.u32(),1);assert.deepEqual(toGuest.take(4),payload);
  guest.send(new Writer().u8(OP.SEND).u32(1).u32(8).raw(payload).finish());
  const toHost=new Reader((await frame(host)).bytes);assert.equal(toHost.u8(),OP.DATA);assert.equal(toHost.u32(),2);assert.deepEqual(toHost.take(4),payload);
  const closed=new Promise(resolve=>guest.once('close',resolve));send(host,masked(8,Uint8Array.of(3,232)));
  assert.equal((await frame(host)).op,8);await closed;
 }finally{for(const id of ids)transport.close(id);guest?.terminate();}
});

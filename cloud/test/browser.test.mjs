import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserRequest, browserResponse } from '../src/browser.mjs';
const base = 'https://joey-online-rooms.joey-online-rooms.workers.dev';
const mobile = 'https://haliosproto.github.io';
test('browser permission and credential adapter preserves native requests', () => {
  const request = new Request(base+'/health');
  assert.equal(browserRequest(request).request, request);
  const result = new Response('bytes');
  assert.equal(browserResponse(result, null, null), result);
});
test('preflight accepts the mobile origin and rejects arbitrary origins or headers', () => {
  const preflight = (origin, requested='content-type') => browserRequest(new Request(base+'/v1/rooms', { method:'OPTIONS', headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':requested}}));
  assert.equal(preflight(mobile).status,204);
  assert.equal(preflight(mobile).headers.get('Access-Control-Allow-Origin'),mobile);
  assert.equal(preflight('https://unrelated.example').status,403);
  assert.equal(preflight(mobile,'authorization').status,403);
  assert.equal(browserRequest(new Request(base+'/health',{headers:{Origin:'null'}})).status,403);
});
test('browser WebSocket host credential becomes the existing authorization header', () => {
  const token='a'.repeat(64);
  const request = new Request(base+'/v1/rooms/'+'b'.repeat(32)+'/play?role=host', {headers:{Origin:mobile,Upgrade:'websocket','Sec-WebSocket-Protocol':'joey-online-v1, joey-auth.'+token}});
  const parsed=browserRequest(request);
  assert.equal(parsed.request.headers.get('Authorization'),'Bearer '+token);
  assert.equal(parsed.request.headers.get('Sec-WebSocket-Protocol'),null);
  assert.equal(parsed.protocol,'joey-online-v1');
  const invalid=new Request(request,{headers:{Origin:mobile,Upgrade:'websocket','Sec-WebSocket-Protocol':'joey-online-v1, joey-auth.short'}});
  assert.equal(browserRequest(invalid).status,403);
});
test('browser response retains binary bytes and includes the exact requesting origin', async () => {
  const response=browserResponse(new Response(Uint8Array.of(0,128,255),{status:201}),mobile,null);
  assert.equal(response.status,201);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()),Uint8Array.of(0,128,255));
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),mobile);
});

const CACHE='joey-mobile-assets-v2';
const ASSETS={};
function cacheKey(url){const key=new URL(url);const hash=ASSETS[key.pathname.split('/').pop()];if(hash)key.searchParams.set('sha256',hash);return key;}
const VIRTUAL={};
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 const archive=url.pathname.split('/').pop(),virtual=VIRTUAL[archive];
 if(virtual){event.respondWith((async()=>{
  let cache;try{cache=await caches.open(CACHE);}catch{}
  const client=event.clientId?await self.clients.get(event.clientId):null;
  let index=0,reader,pendingCache,loaded=0,lastReport=0;
  const report=()=>client?.postMessage({type:'joey-archive-progress',archive,loaded,total:virtual.bytes});report();
  const stream=new ReadableStream({async pull(controller){try{
   for(;;){
    if(!reader){
     if(index===virtual.parts.length){report();controller.close();return;}
     const part=new URL(virtual.parts[index++],url),key=cacheKey(part);
     const cached=cache?await cache.match(key):null,response=cached||await fetch(part);
     if(!response.ok)throw new Error('Game file loading failed. Reload to try again.');
     pendingCache=!cached&&cache?cache.put(key,response.clone()).catch(()=>{cache=null;}):null;
     reader=response.body.getReader();
    }
    const next=await reader.read();
    if(next.done){reader.releaseLock();reader=null;await pendingCache;continue;}
    loaded+=next.value.byteLength;if(loaded-lastReport>=1048576){lastReport=loaded;report();}controller.enqueue(next.value);return;
   }
  }catch(error){controller.error(error);}},cancel(reason){return reader?.cancel(reason);}});
  return new Response(stream,{headers:{'Content-Type':'application/zip','Content-Length':String(virtual.bytes)}});
 })());return;}
 // Never cache the public room service or page navigations.
 if(/\.(zip|wasm|js|css|png)$|\.part[0-9]{3}$/.test(url.pathname)&&!url.pathname.endsWith('/sw.js'))event.respondWith((async()=>{
  let cache;try{cache=await caches.open(CACHE);}catch{}
  const key=cacheKey(event.request.url),hit=cache?await cache.match(key):null;if(hit)return hit;
  const response=await fetch(event.request);if(cache&&response.ok)event.waitUntil(cache.put(key,response.clone()).catch(()=>{}));return response;
 })());
});

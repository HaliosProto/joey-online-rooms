const CACHE='joey-mobile-preview-1';
const VIRTUAL={}; // Filled with verified archive part names by the cloud packager.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 const virtual=VIRTUAL[url.pathname.split('/').pop()];
 if(virtual){event.respondWith((async()=>{
  const cache=await caches.open(CACHE);let index=0,reader;
  const stream=new ReadableStream({async pull(controller){try{
   for(;;){
    if(!reader){if(index===virtual.parts.length){controller.close();return;}const part=new URL(virtual.parts[index++],url);const response=(await cache.match(part))||await fetch(part);if(!response.ok)throw new Error('Missing game download part');reader=response.body.getReader();}
    const next=await reader.read();if(next.done){reader.releaseLock();reader=null;continue;}controller.enqueue(next.value);return;
   }
  }catch(error){controller.error(error);}},cancel(reason){return reader?.cancel(reason);}});
  return new Response(stream,{headers:{'Content-Type':'application/zip','Content-Length':String(virtual.bytes)}});
 })());return;}
 // Cloud room requests always use the network.
 if(/\.(zip|wasm|js|css|png)$|\.part[0-9]{3}$/.test(url.pathname)&&!url.pathname.endsWith('/sw.js'))event.respondWith((async()=>{
  const cache=await caches.open(CACHE);return(await cache.match(event.request))||fetch(event.request);
 })());
});

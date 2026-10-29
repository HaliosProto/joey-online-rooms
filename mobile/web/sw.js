const CACHE='joey-mobile-preview-1';
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 // Only immutable game assets are cached. Cloud room requests always use the network.
 if(/\.(zip|wasm|js|css|png)$/.test(url.pathname)&&!url.pathname.endsWith('/sw.js'))event.respondWith((async()=>{
  const cache=await caches.open(CACHE);return(await cache.match(event.request))||fetch(event.request);
 })());
});

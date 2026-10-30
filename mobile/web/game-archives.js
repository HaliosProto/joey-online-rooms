// Original game archive loading without service-worker/storage permissions.
// Only these two packaged archives are intercepted; all other fetches are native.
(()=>{
 const ARCHIVES={};
 const HASHES={};
 const nativeFetch=globalThis.fetch.bind(globalThis),CACHE='joey-mobile-assets-v2';
 const notify=data=>parent.postMessage(data,location.origin);
 addEventListener('error',event=>{if(event.message)notify({type:'joey-load-error',text:'The game could not start: '+event.message+'. Open this link in a regular Safari, Chrome or Edge tab.'});});
 let cachePromise;
 const storage=()=>cachePromise??=(async()=>{try{return await globalThis.caches.open(CACHE);}catch{return null;}})();
 globalThis.fetch=async(input,options)=>{
  const url=new URL(input instanceof Request?input.url:String(input),location.href),name=url.pathname.split('/').pop();
  const archive=ARCHIVES[name],expected=new URL(name,location.href);
  if(!archive||url.origin!==location.origin||url.pathname!==expected.pathname||(options?.method||'GET')!=='GET')return nativeFetch(input,options);
  let cache=await storage(),index=0,reader,pendingCache,loaded=0,lastReport=0;
  const report=()=>notify({type:'joey-archive-progress',archive:name,loaded,total:archive.bytes});report();
  const stream=new ReadableStream({async pull(controller){try{
   for(;;){
    if(!reader){
     if(index===archive.parts.length){report();controller.close();return;}
     const part=new URL(archive.parts[index++],url),key=new URL(part);if(HASHES[archive.parts[index-1]])key.searchParams.set('sha256',HASHES[archive.parts[index-1]]);
     let response;
     if(cache)try{response=await cache.match(key);}catch{cache=null;}
     if(!response){
      response=await nativeFetch(part,{credentials:'same-origin',signal:options?.signal});
      if(!response.ok)throw Error('Game file loading failed (HTTP '+response.status+'). Please try again.');
      pendingCache=cache?cache.put(key,response.clone()).catch(()=>{cache=null;}):null;
     }else pendingCache=null;
     reader=response.body.getReader();
    }
    const next=await reader.read();
    if(next.done){reader.releaseLock();reader=null;await pendingCache;continue;}
    loaded+=next.value.byteLength;if(loaded-lastReport>=1048576){lastReport=loaded;report();}controller.enqueue(next.value);return;
   }
  }catch(error){notify({type:'joey-load-error',text:error.message||'The game files could not load.'});controller.error(error);}},cancel(reason){return reader?.cancel(reason);}});
  return new Response(stream,{headers:{'Content-Type':'application/zip','Content-Length':String(archive.bytes)}});
 };
})();

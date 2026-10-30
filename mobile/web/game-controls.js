// Phone input uses BoxedWine's existing browser mouse entry points.
(()=>{
 const canvas=document.getElementById('canvas');let active=null,button=0,pressedAt=0;
 const send=(type,x,y)=>{
  const present=document.getElementById('boxedwine-webgl-canvas-0'),style=present&&getComputedStyle(present);
  const target=present&&present.width&&style.display!=='none'&&style.visibility!=='hidden'?present:canvas,rect=target.getBoundingClientRect();
  const click=Module['_boxedwineEmscriptenMouseButton'];if(!rect.width||typeof click!=='function')return;
  const gx=Math.max(0,Math.min(target.width-1,Math.round((Math.trunc(x)-rect.left)*target.width/rect.width))),gy=Math.max(0,Math.min(target.height-1,Math.round((Math.trunc(y)-rect.top)*target.height/rect.height)));
  Module['_boxedwineEmscriptenPointerLock'](0);
  if(type==='mousemove')Module['_boxedwineEmscriptenMouseMove'](gx,gy);
  else{canvas.focus();click(type==='mousedown'?1:0,button===2?1:0,gx,gy);}
 };
 const touch=(type,handler)=>document.addEventListener(type,event=>{if(event.target!==canvas)return;event.preventDefault();event.stopImmediatePropagation();handler(event);},{capture:true,passive:false});
 touch('touchstart',event=>{if(active!==null)return;const p=event.changedTouches[0];active=p.identifier;button=window.joeyRightClick?2:0;pressedAt=performance.now();send('mousemove',p.clientX,p.clientY);send('mousedown',p.clientX,p.clientY);});
 touch('touchmove',event=>{const p=Array.from(event.changedTouches).find(t=>t.identifier===active);if(p)send('mousemove',p.clientX,p.clientY);});
 const release=event=>{const p=Array.from(event.changedTouches).find(t=>t.identifier===active);if(!p)return;setTimeout(()=>{send('mouseup',p.clientX,p.clientY);active=null;if(window.joeyRightClick){window.joeyRightClick=false;parent.postMessage({type:'joey-right-used'},location.origin);}},Math.max(0,150-(performance.now()-pressedAt)));};
 touch('touchend',release);touch('touchcancel',release);
 window.joeyKey=(key,code,keyCode)=>{canvas.focus();const opts={bubbles:true,cancelable:true,key,code,keyCode,which:keyCode};document.dispatchEvent(new KeyboardEvent('keydown',opts));setTimeout(()=>document.dispatchEvent(new KeyboardEvent('keyup',opts)),80);};
 let typing=Promise.resolve();
 window.joeyTypeText=text=>{typing=typing.then(async()=>{for(const key of text){
  const code=/[a-z]/i.test(key)?'Key'+key.toUpperCase():/[0-9]/.test(key)?'Digit'+key:({' ':'Space','-':'Minus','_':'Minus','.':'Period'})[key];if(!code)continue;
  const upper=/[A-Z_]/.test(key);if(upper)document.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Shift',code:'ShiftLeft',keyCode:16}));
  window.joeyKey(key,code,key.toUpperCase().charCodeAt(0));await new Promise(r=>setTimeout(r,120));
  if(upper)document.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:'Shift',code:'ShiftLeft',keyCode:16}));
 }});};
 const originalDownload=window.downloadBlob;
 window.downloadBlob=async function(blob,filename){
  if(typeof parent.JoeySaveExport?.save==='function'){
   if(blob.size>24*1024*1024){alert('This backup is too large for Android export.');return;}
   const reader=new FileReader();reader.onload=()=>parent.JoeySaveExport.save(String(reader.result).split(',')[1]);reader.readAsDataURL(blob);
  }else if(navigator.canShare?.({files:[new File([blob],filename,{type:'application/zip'})]})){
   try{await navigator.share({files:[new File([blob],filename,{type:'application/zip'})]});}catch(error){if(error.name!=='AbortError')originalDownload(blob,filename);}
  }else originalDownload(blob,filename);
 };
 const performanceLog=[];
 const originalPrint=Module.print;Module.print=function(...args){originalPrint?.(...args);const text=args.join(' ');if(/\[MIPS\]|WASM JIT.*(?:first|simd|unavailable|batching)|ran main loop/.test(text)){performanceLog.push({at:Math.round(performance.now()),text});if(performanceLog.length>16)performanceLog.shift();}if(text.includes('integrated cloud networking enabled'))parent.postMessage({type:'joey-status',text:'Tap to click; drag cards. Tap a demonstration to return to the menu.'},location.origin);};
 let measuring=false;
 window.joeyMeasurePerformance=async()=>{
  if(measuring)throw Error('A performance check is already running.');measuring=true;
  const start=performance.now(),frames=[],delays=[],longTasks=[],restore=[];let lastFrame=start,lastTimer=start,active=true,drawCalls=0,renderIntervals=0,drew=false,observer;
  const onFrame=time=>{if(!active)return;frames.push(time-lastFrame);lastFrame=time;if(drew)renderIntervals++;drew=false;requestAnimationFrame(onFrame);};
  const onTimer=()=>{if(!active)return;const now=performance.now();delays.push(Math.max(0,now-lastTimer-50));lastTimer=now;setTimeout(onTimer,50);};
  try{
   for(const Constructor of [globalThis.WebGLRenderingContext,globalThis.WebGL2RenderingContext]){
    const proto=Constructor?.prototype;if(!proto)continue;
    for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){
     const original=proto[name];if(typeof original!=='function')continue;
     const wrapped=function(...args){drawCalls++;drew=true;return original.apply(this,args);};
     try{proto[name]=wrapped;restore.push(()=>{if(proto[name]===wrapped)proto[name]=original;});}catch{}
    }
   }
   try{observer=new PerformanceObserver(list=>{for(const e of list.getEntries())longTasks.push({at:Math.round(e.startTime-start),ms:Math.round(e.duration)});});observer.observe({type:'longtask'});}catch{}
   requestAnimationFrame(onFrame);setTimeout(onTimer,50);
   await new Promise(resolve=>setTimeout(resolve,10000));
   const seconds=(performance.now()-start)/1000;
   const summary=values=>{const a=values.slice().sort((a,b)=>a-b);return {count:a.length,medianMs:a.length?Math.round(a[Math.floor(a.length*.5)]*10)/10:null,p95Ms:a.length?Math.round(a[Math.min(a.length-1,Math.floor(a.length*.95))]*10)/10:null,maxMs:a.length?Math.round(a.at(-1)*10)/10:null};};
   let graphics={};
   const display=document.getElementById('boxedwine-webgl-canvas-0'),style=display&&getComputedStyle(display);
   const surface=display&&display.width&&style.display!=='none'&&style.visibility!=='hidden'?display:canvas;
   for(const kind of ['webgl2','webgl']){
    let gl;try{gl=surface.getContext(kind);}catch{}if(!gl)continue;
    const ext=gl.getExtension('WEBGL_debug_renderer_info');graphics={context:kind,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),lost:gl.isContextLost()};break;
   }
   return {format:'joey-performance-v1',created:new Date().toISOString(),seconds:Math.round(seconds*10)/10,browser:navigator.userAgent,logicalProcessors:navigator.hardwareConcurrency,memoryLimitGiB:navigator.deviceMemory??null,visibility:document.visibilityState,storage:new URLSearchParams(location.search).get('storage'),runtimeHeapMiB:Module.HEAPU8?Math.round(Module.HEAPU8.buffer.byteLength/1048576):null,graphics,canvas:{width:surface.width,height:surface.height},browserAnimation:summary(frames),timerDelay:summary(delays),longTasks,renderCalls:drawCalls,renderIntervals,renderIntervalsPerSecond:Math.round(renderIntervals/seconds*10)/10,note:'Browser animation and render intervals are diagnostics, not a measurement of game simulation FPS. No saves, player names or room credentials are included.',runtimeLog:performanceLog.slice()};
  }finally{active=false;observer?.disconnect();for(const undo of restore)undo();measuring=false;}
 };
})();

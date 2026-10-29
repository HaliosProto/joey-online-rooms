// Input stays inside the game frame. Android save export opens the system file picker.
(()=>{
 const canvas=document.getElementById('canvas');let active=null,button=0,pressedAt=0;
 // Call the emulator's input entry points directly so browser focus changes cannot
 // release a synthetic mouse press before the guest game polls it.
 const send=(type,x,y)=>{
  const present=document.getElementById('boxedwine-webgl-canvas-0');const style=present&&getComputedStyle(present);
  const target=present&&present.width&&style.display!=='none'&&style.visibility!=='hidden'?present:canvas;const rect=target.getBoundingClientRect();
  if(!rect.width||typeof window._boxedwineEmscriptenMouseButton!=='function')return;
  const gx=Math.max(0,Math.min(target.width-1,Math.round((x-rect.left)*target.width/rect.width))),gy=Math.max(0,Math.min(target.height-1,Math.round((y-rect.top)*target.height/rect.height)));
  window._boxedwineEmscriptenPointerLock(0);
  if(type==='mousemove')window._boxedwineEmscriptenMouseMove(gx,gy);
  else{canvas.focus();window._boxedwineEmscriptenMouseButton(type==='mousedown'?1:0,button===2?1:0,gx,gy);}
 };
 const touch=(type,handler)=>document.addEventListener(type,event=>{if(event.target!==canvas)return;event.preventDefault();event.stopImmediatePropagation();handler(event);},{capture:true,passive:false});
 touch('touchstart',event=>{if(active!==null)return;const point=event.changedTouches[0];active=point.identifier;pressedAt=performance.now();button=window.joeyRightClick?2:0;canvas.focus();window.dispatchEvent(new FocusEvent('focus'));canvas.dispatchEvent(new MouseEvent('mouseenter',{clientX:point.clientX,clientY:point.clientY,view:window}));send('mousemove',point.clientX,point.clientY);send('mousedown',point.clientX,point.clientY);});
 touch('touchmove',event=>{const point=Array.from(event.changedTouches).find(p=>p.identifier===active);if(point)send('mousemove',point.clientX,point.clientY);});
 const release=event=>{const point=Array.from(event.changedTouches).find(p=>p.identifier===active);if(!point)return;const x=point.clientX,y=point.clientY;setTimeout(()=>{send('mouseup',x,y);active=null;if(window.joeyRightClick){window.joeyRightClick=false;parent.postMessage({type:'joey-right-used'},location.origin);}},Math.max(0,500-(performance.now()-pressedAt)));};
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
 const originalPrint=Module.print;Module.print=function(...args){originalPrint?.(...args);const text=args.join(' ');if(text.includes('integrated cloud networking enabled'))parent.postMessage({type:'joey-status',text:'Tap the game once to activate, then choose a mode. Drag cards; Right click for the next tap.'},location.origin);};
})();

// Input stays inside the local game frame; no native application bridge is exposed.
(()=>{
 const canvas=document.getElementById('canvas');let active=null,button=0;
 const send=(type,x,y)=>canvas.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button,buttons:type==='mouseup'?0:button===2?2:1,view:window}));
 canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'||active!==null)return;e.preventDefault();active=e.pointerId;button=window.joeyRightClick?2:0;canvas.setPointerCapture(active);send('mousemove',e.clientX,e.clientY);send('mousedown',e.clientX,e.clientY);},{passive:false});
 canvas.addEventListener('pointermove',e=>{if(e.pointerId!==active)return;e.preventDefault();send('mousemove',e.clientX,e.clientY);},{passive:false});
 const release=e=>{if(e.pointerId!==active)return;e.preventDefault();send('mouseup',e.clientX,e.clientY);active=null;if(window.joeyRightClick){window.joeyRightClick=false;parent.postMessage({type:'joey-right-used'},location.origin);}};
 canvas.addEventListener('pointerup',release,{passive:false});canvas.addEventListener('pointercancel',release,{passive:false});
 window.joeyKey=(key,code,keyCode)=>{canvas.focus();const opts={bubbles:true,cancelable:true,key,code,keyCode,which:keyCode};document.dispatchEvent(new KeyboardEvent('keydown',opts));setTimeout(()=>document.dispatchEvent(new KeyboardEvent('keyup',opts)),80);};
 window.joeyType=character=>{canvas.focus();document.dispatchEvent(new KeyboardEvent('keypress',{bubbles:true,cancelable:true,key:character,charCode:character.codePointAt(0),keyCode:character.codePointAt(0),which:character.codePointAt(0)}));};
 const originalPrint=Module.print;Module.print=function(...args){originalPrint?.(...args);const text=args.join(' ');if(text.includes('integrated cloud networking enabled'))parent.postMessage({type:'joey-status',text:'Tap to click · drag cards · Right click for the next tap'},location.origin);};
})();

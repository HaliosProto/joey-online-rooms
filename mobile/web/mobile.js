const $=id=>document.getElementById(id);
const message=$('message'),button=$('prepare'),progress=$('download'),frame=$('game');
let started=false,right=false;
let saveMode='indexeddb',saveWarning='';
async function canSave(){
 return new Promise(resolve=>{
  let request,timer,settled=false;
  const finish=ok=>{if(settled)return;settled=true;clearTimeout(timer);resolve(ok);};
  try{
   request=indexedDB.open('joey-browser-capability-check',1);timer=setTimeout(()=>finish(false),2000);
   request.onupgradeneeded=()=>request.result.createObjectStore('check');
   request.onsuccess=()=>{request.result.close();finish(true);};request.onerror=()=>finish(false);request.onblocked=()=>finish(false);
  }catch{finish(false);}
 });
}
async function prepare(){
 button.disabled=true;progress.hidden=false;
 try{
  message.textContent='Opening the original game…';
  if(typeof WebAssembly!=='object'||typeof fetch!=='function')throw new Error('This browser cannot run the game. Open this link in Safari, Chrome or Edge.');
  // Background caching is optional. A denied or unavailable service worker
  // must never prevent the public game from opening.
  try{navigator.serviceWorker?.register('sw.js').catch(()=>{});}catch{}
  try{navigator.storage?.persist?.().catch(()=>false);}catch{}
  saveMode=await canSave()?'indexeddb':'memory';saveWarning=saveMode==='memory'?' This browser blocks saved progress; use a regular Safari or Chrome tab to keep saves.':'';
  progress.hidden=true;startGame();
 }catch(error){message.textContent=error.message;button.textContent='Try again';button.disabled=false;}
}
function startGame(){
 started=true;$('welcome').hidden=true;$('play').hidden=false;
 const params=new URLSearchParams({root:'runtime',app:'game',p:'start-game.bat',w:'c:/files/joey',auto:'true',storage:saveMode,storageKey:'joey-online-v1',loader:'direct-archives-v1'});
 frame.src='boxedwine.html?'+params;button.disabled=true;
}
function key(name,code,keyCode){const win=frame.contentWindow;win?.joeyKey?.(name,code,keyCode);}
$('back').onclick=()=>key('Escape','Escape',27);
$('right').onclick=()=>{right=!right;$('right').setAttribute('aria-pressed',String(right));frame.contentWindow.joeyRightClick=right;};
$('name').onclick=()=>{$('text-entry').showModal();$('typed').focus();};
$('send-text').onclick=()=>{frame.contentWindow.joeyTypeText?.($('typed').value);$('typed').value='';};
$('full').onclick=()=>document.fullscreenElement?document.exitFullscreen?.():$('play').requestFullscreen?.();
$('backup').onclick=()=>{try{frame.contentWindow.saveOverlay();}catch{alert('Start the game before exporting a save backup.');}};
window.joeyBack=()=>{if(!started)return false;key('Escape','Escape',27);return true;};
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
 if(event.data?.type==='joey-status')$('running-status').textContent=String(event.data.text).slice(0,200)+saveWarning;
 if(event.data?.type==='joey-status')$('loading-game').hidden=true;
 if(event.data?.type==='joey-archive-progress'){
  const {archive,loaded,total}=event.data;if(!['game.zip','runtime.zip'].includes(archive)||!Number.isFinite(loaded)||!Number.isFinite(total)||total<=0)return;
  loading[archive]={loaded,total};const values=Object.values(loading),done=values.reduce((n,x)=>n+x.loaded,0),size=values.reduce((n,x)=>n+x.total,0);$('loading-game').hidden=false;$('loading-game').value=done/size;
  $('running-status').textContent=(done<size?'Loading original game files: '+Math.round(done/1048576)+' / '+Math.round(size/1048576)+' MB. Keep this tab open.':'Starting the original game. This can take several minutes.')+saveWarning;
 }
 if(event.data?.type==='joey-right-used'){right=false;$('right').setAttribute('aria-pressed','false');}
 if(event.data?.type==='joey-load-error'){
  $('running-status').textContent=String(event.data.text).slice(0,240);$('loading-game').hidden=true;
 }
});
const loading={};
button.onclick=prepare;

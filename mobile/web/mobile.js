const $=id=>document.getElementById(id);
const message=$('message'),button=$('prepare'),progress=$('download'),frame=$('game');
let started=false,right=false;
const CACHE='joey-mobile-preview-1';
async function prepare(){
 button.disabled=true;progress.hidden=false;
 try{
  if(!('serviceWorker' in navigator)||!('caches' in window))throw new Error('Use a current Safari or Chrome browser to play.');
  await navigator.serviceWorker.register('sw.js');await navigator.serviceWorker.ready;
  if(!navigator.serviceWorker.controller)await new Promise((resolve,reject)=>{navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true});setTimeout(()=>reject(new Error('Please reload this page once, then try again.')),10000);});
  const manifest=await fetch('assets.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Game files are not available yet.');return r.json();});
  const total=manifest.reduce((sum,x)=>sum+x.bytes,0);let done=0;
  const estimate=await navigator.storage?.estimate?.();
  if(estimate?.quota && estimate.quota-estimate.usage<total*1.2)message.textContent='Storage is low. Free about 1 GB if the download fails.';
  await navigator.storage?.persist?.().catch(()=>false);const cache=await caches.open(CACHE);
  for(const asset of manifest){
   const url=new URL(asset.path,location.href);const existing=await cache.match(url);
   if(existing){done+=asset.bytes;progress.value=done/total;continue;}
   message.textContent='Downloading game: '+Math.round(done/total*100)+'%';
   const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw new Error('Download failed. Try again; completed files are kept.');
   let received=0;const meter=new TransformStream({transform(chunk,controller){received+=chunk.byteLength;progress.value=(done+received)/total;message.textContent='Downloading game: '+Math.min(100,Math.round((done+received)/total*100))+'%';controller.enqueue(chunk);}});
   await cache.put(url,new Response(response.body.pipeThrough(meter),{status:200,headers:response.headers}));done+=asset.bytes;
  }
  button.textContent='Start game';button.disabled=false;button.onclick=startGame;progress.hidden=true;message.textContent='Ready. Startup can take several minutes. Your saves stay on this device.';
 }catch(error){message.textContent=error.message;button.textContent='Try again';button.disabled=false;}
}
function startGame(){
 started=true;$('welcome').hidden=true;$('play').hidden=false;
 const params=new URLSearchParams({root:'runtime',app:'game',p:'start-game.bat',w:'c:/files/joey',auto:'true',storage:'indexeddb',storageKey:'joey-online-v1'});
 frame.src='boxedwine.html?'+params;button.disabled=true;
}
function key(name,code,keyCode){const win=frame.contentWindow;win?.joeyKey?.(name,code,keyCode);}
$('back').onclick=()=>key('Escape','Escape',27);$('enter').onclick=()=>key('Enter','Enter',13);
$('right').onclick=()=>{right=!right;$('right').setAttribute('aria-pressed',String(right));frame.contentWindow.joeyRightClick=right;};
$('name').onclick=()=>{$('text-entry').showModal();$('typed').focus();};
$('send-text').onclick=()=>{frame.contentWindow.joeyTypeText?.($('typed').value);$('typed').value='';};
$('full').onclick=()=>document.fullscreenElement?document.exitFullscreen?.():$('play').requestFullscreen?.();
$('backup').onclick=()=>{try{frame.contentWindow.saveOverlay();}catch{alert('Start the game before exporting a save backup.');}};
window.joeyBack=()=>{if(!started)return false;key('Escape','Escape',27);return true;};
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
 if(event.data?.type==='joey-status')$('running-status').textContent=String(event.data.text).slice(0,200);
 if(event.data?.type==='joey-right-used'){right=false;$('right').setAttribute('aria-pressed','false');}
});
button.onclick=prepare;

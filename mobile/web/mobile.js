const $=id=>document.getElementById(id);
const message=$('message'),button=$('prepare'),progress=$('download'),frame=$('game');
let started=false,right=false;
async function prepare(){
 button.disabled=true;progress.hidden=false;
 try{
  if(!('serviceWorker' in navigator)||!('caches' in window))throw new Error('Use a current Safari or Chrome browser to play.');
  await navigator.serviceWorker.register('sw.js');await navigator.serviceWorker.ready;
  if(!navigator.serviceWorker.controller)await new Promise((resolve,reject)=>{navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true});setTimeout(()=>reject(new Error('Please reload this page once, then try again.')),10000);});
  navigator.storage?.persist?.().catch(()=>false);
  // Launch directly. Archive pieces cache as they load, with no install stage.
  progress.hidden=true;startGame();
 }catch(error){message.textContent=error.message;button.textContent='Try again';button.disabled=false;}
}
function startGame(){
 started=true;$('welcome').hidden=true;$('play').hidden=false;
 const params=new URLSearchParams({root:'runtime',app:'game',p:'start-game.bat',w:'c:/files/joey',auto:'true',storage:'indexeddb',storageKey:'joey-online-v1'});
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
 if(event.data?.type==='joey-status')$('running-status').textContent=String(event.data.text).slice(0,200);
 if(event.data?.type==='joey-status')$('loading-game').hidden=true;
 if(event.data?.type==='joey-archive-progress'){
  const {archive,loaded,total}=event.data;if(!['game.zip','runtime.zip'].includes(archive)||!Number.isFinite(loaded)||!Number.isFinite(total)||total<=0)return;
  loading[archive]={loaded,total};const values=Object.values(loading),done=values.reduce((n,x)=>n+x.loaded,0),size=values.reduce((n,x)=>n+x.total,0);$('loading-game').hidden=false;$('loading-game').value=done/size;
  $('running-status').textContent=done<size?'Loading original game files: '+Math.round(done/1048576)+' / '+Math.round(size/1048576)+' MB. Keep this tab open.':'Starting the original game. This can take several minutes.';
 }
 if(event.data?.type==='joey-right-used'){right=false;$('right').setAttribute('aria-pressed','false');}
});
const loading={};
button.onclick=prepare;

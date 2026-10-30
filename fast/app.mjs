import {Rooms,json} from './rooms.mjs';
import {choices} from './prompts.mjs';
import {validateDeck} from './deck.mjs';
const $=id=>document.getElementById(id);
const node=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
const button=(text,action,className)=>{const b=node('button',text,className);b.onclick=action;return b;};
const status=(text,error=false)=>{$('status').textContent=text;$('status').classList.toggle('error',error);};
let catalog,cards,labels,deck,editor,worker,workerReady,resolveWorker,rejectWorker,room,mode='lobby',view,views,selected=null,pending=false,plan,selections=[],places=[],order=[],counters=[],guestDeck,started=false;
let metrics={pageStart:performance.now()},poll;
const names=['You','Friend'];
const roomService=new Rooms({endpoint:globalThis.JOEY_TEST_ENDPOINT||undefined,onEvent:onRoom});
function readSaved(){try{return validateDeck(JSON.parse(localStorage.getItem('joey-fast-deck')),catalog);}catch{return structuredClone(catalog.starter);}}
function storedName(){try{return localStorage.getItem('joey-fast-name')||'';}catch{return '';}}
function playerName(){const value=$('player-name').value.trim();if(!value||value.length>32||/[\x00-\x1f\x7f]/.test(value))throw Error('Enter your duelist name first.');try{localStorage.setItem('joey-fast-name',value);}catch{}return value;}
async function init(){
 try{
  catalog=await fetch('catalog.json').then(r=>{if(!r.ok)throw Error('Card files are unavailable.');return r.json();});cards=new Map([...catalog.cards,...(catalog.tokens||[])].map(c=>[c.id,c]));labels=Object.fromEntries([...cards.values()].map(c=>[c.id,{name:c.name,strings:c.strings||[]}]));deck=readSaved();
  $('player-name').value=storedName();$('lobby').hidden=false;status('Choose a room or create a table for your friend.');
  for(const card of [catalog.cards.find(c=>c.name==='Red-Eyes B. Dragon'),catalog.cards.find(c=>c.name==='Blue-Eyes White Dragon'),catalog.cards.find(c=>c.name==='Dark Magician')].filter(Boolean))document.querySelector('.featured').append(image(card.id));
  metrics.interfaceReadyMs=performance.now()-metrics.pageStart;window.joeyMetrics=metrics;await refresh();poll=setInterval(()=>{if(mode==='lobby')refresh();},15000);
  if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
 }catch(error){status(error.message,true);}
}
function image(code){const img=node('img');img.src=cards.get(code)?.image||'cards/back.webp';img.alt=cards.get(code)?.name||'Face-down card';img.loading='lazy';img.decoding='async';return img;}
async function refresh(){
 try{const list=await roomService.list();$('rooms').replaceChildren();if(!list.length)$('rooms').append(node('p','No open rooms yet. Create one and invite a friend.'));
  for(const r of list){const b=button('',()=>join(r));b.className='room';b.append(node('span',r.name),node('small',`${r.players}/2 · ${r.players<2?'Join':'Full'}`));b.disabled=r.players>=2;$('rooms').append(b);}
 }catch(error){$('rooms').replaceChildren(node('p',error.message));}
}
async function ensureWorker(){
 if(workerReady)return workerReady;
 status('Preparing the duel engine…');worker=new Worker(new URL('./engine-worker.mjs',import.meta.url),{type:'module'});
 workerReady=new Promise((resolve,reject)=>{resolveWorker=resolve;rejectWorker=reject;});
 worker.onmessage=({data})=>{
  if(data.kind==='ready'){metrics.engineInitMs=data.initMs;resolveWorker();}
  else if(data.kind==='views'){
   metrics.engine=data.metrics;views=data.views;pending=false;
   if(mode==='host'){applyView(views[0]);try{roomService.send({kind:'state',view:views[1]});}catch(error){status(error.message,true);}}
   else if(mode==='practice')applyView(views[views[0].waitingFor??0]);
  }else if(data.kind==='error'){pending=false;console.error(data.stack||data.message);status(data.message,true);rejectWorker?.(Error(data.message));}
 };
 worker.onerror=()=>{pending=false;const error=Error('The duel engine could not load. Reload and try again.');status(error.message,true);rejectWorker?.(error);};
 worker.postMessage({kind:'init'});return workerReady;
}
async function host(){
 try{const name=playerName(),title=$('room-name').value.trim()||`${name}'s table`;if(title.length>60)throw Error('Use a shorter room name.');$('create').disabled=true;await ensureWorker();mode='host';names[0]=name;guestDeck=null;started=false;room=await roomService.create(title,name);enterTable();status('Room created. Waiting for your friend to join.');}
 catch(error){mode='lobby';status(error.message,true);}finally{$('create').disabled=false;}
}
async function join(r){
 try{const name=playerName();mode='guest';names[1]=name;enterTable();status('Joining '+r.name+'…');await roomService.connect(r.id,name);room=r.id;}
 catch(error){leave();status(error.message,true);}
}
function onRoom(event){
 try{
  if(event.kind==='welcome'){
   for(const p of event.players)names[p.id-1]=p.name;
   if(event.local===2)roomService.send({kind:'ready',deck});
  }else if(event.kind==='joined')names[event.id-1]=event.name;
  else if(event.kind==='data'){
   const data=event.payload;if(!data||typeof data!=='object')throw Error('Invalid game update.');
   if(mode==='host'&&event.sender===2){
    if(data.kind==='ready'&&!started){guestDeck=validateDeck(data.deck,catalog);started=true;worker.postMessage({kind:'start',decks:[deck,guestDeck]});}
    else if(data.kind==='action'&&started)worker.postMessage({kind:'respond',player:1,revision:data.revision,response:data.response});
    else if(data.kind==='surrender'&&started)worker.postMessage({kind:'surrender',player:1});
   }else if(mode==='guest'&&event.sender===1&&data.kind==='state'){
    if(data.view?.viewer!==1||!Array.isArray(data.view.players)||data.view.players.length!==2)throw Error('Invalid field update.');applyView(data.view);pending=false;
   }
  }else if(event.kind==='left'||event.kind==='closed'){if(mode==='host'||mode==='guest'){if(view&&view.winner===null){view.prompt=null;pending=false;plan={title:'Room closed',options:[]};renderChoices();$('surrender').disabled=true;}status('Your friend disconnected. Leave this duel to create or join another room.',true);}}
  else if(event.kind==='error')status(event.message,true);
 }catch(error){status(error.message,true);}
}
async function practice(){
 try{mode='practice';names[0]='Player 1';names[1]='Player 2';enterTable();await ensureWorker();worker.postMessage({kind:'start',decks:[deck,deck]});}catch(error){leave();status(error.message,true);}
}
function enterTable(){$('lobby').hidden=true;$('table').hidden=false;$('leave').hidden=false;selected=null;$('board').replaceChildren();$('hand').replaceChildren();$('decisions').replaceChildren();$('decision-title').textContent='Preparing your table…';}
function leave(){roomService.close();mode='lobby';view=null;views=null;started=false;pending=false;guestDeck=null;if(worker){worker.terminate();worker=null;workerReady=null;}$('table').hidden=true;$('lobby').hidden=false;$('leave').hidden=true;status('Choose a room or create a new table.');refresh();}
function applyView(next){pending=false;view=next;selections=[];places=[];order=[];counters=[];selected=null;plan=choices(view.prompt,labels,catalog.cards);render();metrics.lastViewMs=performance.now()-metrics.pageStart;window.joeyState=view;window.joeyPlan=plan;window.dispatchEvent(new CustomEvent('joey-state',{detail:{revision:view.revision}}));}
function respond(response){if(pending||!view?.prompt)return;pending=true;renderChoices();const data={kind:'respond',player:view.viewer,revision:view.revision,response};try{if(mode==='guest')roomService.send({kind:'action',revision:view.revision,response});else worker.postMessage(data);}catch(error){pending=false;status(error.message,true);renderChoices();}}
function phaseName(phase){return ({1:'Draw',2:'Standby',4:'Main phase 1',8:'Battle phase',16:'Battle phase',32:'Damage step',64:'Damage calculation',128:'Battle phase',256:'Main phase 2',512:'End phase'})[phase]||'Starting duel';}
function render(){
 const me=view.viewer,other=1-me;$('turn-label').textContent=`Turn ${view.turnNumber} · ${names[view.turn]||'Duelist'} · ${phaseName(view.phase)}`;
 $('board').replaceChildren(renderSide(other,true),renderSide(me,false));$('hand').replaceChildren();
 for(const card of view.players[me].hand.filter(Boolean))$('hand').append(cardButton(card));
 $('deck-count').textContent=`Deck ${view.players[me].deck} · ${mode==='practice'?'Controlling both players':names[me]}`;
 $('log').replaceChildren(...view.log.map(line=>node('li',line)));
 if(view.winner!==null){$('decision-title').textContent=view.winner>1?'Draw':`${names[view.winner]} wins!`;$('decisions').replaceChildren(button('Back to rooms',leave,'primary'));$('selection-actions').replaceChildren();status('Duel finished.');}
 else{renderChoices();status(view.notice|| (view.prompt?'Your choice. Tap a card or choose an action.':`${names[view.waitingFor]||'Your friend'} is choosing…`),Boolean(view.notice));}
 $('surrender').disabled=view.winner!==null;
}
function renderSide(player,opponent){
 const state=view.players[player],side=node('section',undefined,'side'),hud=node('div',undefined,'player-hud');hud.append(node('strong',names[player]),node('span',`Hand ${state.hand.filter(Boolean).length}`),node('span',`${state.lp.toLocaleString()} LP`,'life'));
 for(const [part,label] of [['grave','Grave'],['banished','Banished'],['extra','Fusion']])hud.append(button(`${label} ${state[part].filter(Boolean).length}`,()=>showPile(state[part],`${names[player]} · ${label}`)));
 side.append(hud);const rows=node('div',undefined,'rows');
 for(const [part,location] of (opponent?[['spells',8],['monsters',4]]:[['monsters',4],['spells',8]])){
  const row=node('div',undefined,'row');
  for(let sequence=0;sequence<5;sequence++){
   const card=state[part][sequence],place={player,location,sequence};const option=plan?.places&&plan.options.find(x=>json(x.place)===json(place));
   const slot=button('',()=>option?selectPlace(place):card&&inspect(card),'slot'+(!card?' empty':'')+(card?.position&12?' defense':'')+(option?' available':''));slot.setAttribute('aria-label',`${opponent?'Opponent':'Your'} ${part==='monsters'?'monster':'spell/trap'} slot ${sequence+1}${card&&!card.hidden?': '+(cards.get(card.code)?.name||'Card'):''}`);
   if(card){slot.append(image(card.hidden?0:card.code));if(!card.hidden&&part==='monsters')slot.append(node('span',`${card.attack??'?'}/${card.defense??'?'}`,'stats'));}else slot.textContent=part==='monsters'?'MONSTER':'SPELL / TRAP';row.append(slot);
  }
  rows.append(row);
 }
 // Field spells occupy their own sixth spell slot in the classic ruleset.
 if(state.spells[5])hud.append(button('Field spell',()=>inspect(state.spells[5])));
 side.append(rows);return side;
}
function cardButton(card){const b=button('',()=>inspect(card),'card'+(selected===card.code?' selected':''));b.append(image(card.hidden?0:card.code),node('small',card.hidden?'Face down':cards.get(card.code)?.name||'Card'));b.setAttribute('aria-label',card.hidden?'Face-down card':cards.get(card.code)?.name||'Card');return b;}
function inspect(card){
 if(card.hidden)return;const c=cards.get(card.code);if(!c)return;
 if(plan?.options.some(x=>x.card===card.code&&x.response)){selected=card.code;renderChoices();}
 $('card-detail').replaceChildren();const layout=node('div',undefined,'detail'),text=node('div');text.append(node('h2',c.name),node('p',`${c.kind==='monster'||c.kind==='fusion'||c.kind==='ritual'?`Level ${c.level} · ATK ${card.attack??c.attack} / DEF ${card.defense??c.defense}`:c.kind.toUpperCase()}`,'numbers'),node('p',c.text));
 const actions=plan?.options.filter(x=>x.card===card.code&&x.response)||[];
 for(const action of actions){const b=button(action.label,()=>{$('card-dialog').close();respond(action.response);},'primary');b.dataset.choice=plan.options.indexOf(action);text.append(b);}
 layout.append(image(c.id),text);$('card-detail').append(layout);$('card-dialog').showModal();
}
function showPile(pile,title){$('card-detail').replaceChildren(node('h2',title));const row=node('div');row.style.cssText='display:flex;gap:8px;flex-wrap:wrap';for(const card of pile.filter(Boolean)){const b=cardButton(card);b.onclick=()=>{if(!card.hidden){$('card-dialog').close();inspect(card);}};row.append(b);}$('card-detail').append(row);$('card-dialog').showModal();}
function selectPlace(place){if(plan.places.count===1)respond({type:plan.places.type,places:[place]});else{const key=json(place),index=places.findIndex(p=>json(p)===key);if(index<0)places.push(place);else places.splice(index,1);renderChoices();}}
function renderChoices(){
 $('decisions').replaceChildren();$('selection-actions').replaceChildren();$('selection-count').textContent='';if(!plan)return;
 $('decision-title').textContent=pending?'Sending your choice…':plan.title;if(pending)return;
 const selection=plan.selection||plan.flags||plan.order||plan.counters||plan.places;
 let options=plan.options;
 if(view?.prompt?.type===10||view?.prompt?.type===11){options=options.filter(o=>o.phase||o.card===selected);if(!selected)$('decisions').append(node('p','Tap a card to inspect it and choose a move.'));}
 if(plan.declare){const search=node('input');search.placeholder='Type a card name';search.oninput=()=>{const query=search.value.toLowerCase();for(const b of $('decisions').querySelectorAll('button'))b.hidden=!b.textContent.toLowerCase().includes(query);};$('decisions').append(search);}
 for(const option of options){
  const b=button('',()=>{
   if(option.response){respond(option.response);return;}
   if(option.place){selectPlace(option.place);return;}
   if(plan.counters){counters[option.index]=((counters[option.index]||0)+1)%(option.max+1);renderChoices();return;}
   const key=option.index??option.flag;const a=plan.order?order:selections,index=a.indexOf(key);if(index<0)a.push(key);else a.splice(index,1);renderChoices();
  });
  if(option.card)b.append(image(option.card));b.append(node('span',option.label));
  b.dataset.choice=plan.options.indexOf(option);
  const key=option.index??option.flag;if((plan.order?order:selections).includes(key))b.setAttribute('aria-pressed','true');
  if(plan.order&&order.includes(key))b.append(node('small',String(order.indexOf(key)+1)));
  if(plan.counters)b.append(node('small',`${counters[option.index]||0}/${option.max}`));
  $('decisions').append(b);
 }
 if(selection){
  $('selection-count').textContent=plan.places?`${places.length}/${plan.places.count}`:plan.counters?`${counters.reduce((s,x)=>s+(x||0),0)}/${plan.counters.count}`:`${(plan.order?order:selections).length} selected`;
  const confirm=button('Confirm selection',()=>{
   if(plan.selection)respond({type:plan.selection.type,indicies:[...Array.from({length:plan.selection.must.length},(_,i)=>i),...selections.map(i=>i+plan.selection.must.length)]});
   else if(plan.flags)respond({type:plan.flags.type,[plan.flags.key]:selections});
   else if(plan.order)respond({type:15,order});
   else if(plan.counters)respond({type:13,counters:plan.options.map((_,i)=>counters[i]||0)});
   else if(plan.places)respond({type:plan.places.type,places});
  },'primary');$('selection-actions').append(confirm);
  if(plan.selection&&plan.selection.must.length)$('selection-actions').append(node('small','Required: '+plan.selection.must.map(c=>cards.get(c.code)?.name||'Card').join(', ')));
 }
 if(plan.cancel)$('selection-actions').append(button('Cancel',()=>respond(plan.cancel)));
}
function editDeck(){editor=structuredClone(deck);renderDeck();$('deck-dialog').showModal();}
function renderDeck(){
 const count=new Map();for(const id of [...editor.main,...editor.extra])count.set(id,(count.get(id)||0)+1);
 $('deck-summary').textContent=`${editor.main.length}/40–60 main deck · ${editor.extra.length} Fusion · up to 3 of each card`;
 const query=$('search').value.toLowerCase().trim();$('library').replaceChildren();$('deck-cards').replaceChildren();
 for(const c of catalog.cards.filter(c=>(c.name+' '+c.text).toLowerCase().includes(query)).slice(0,100)){
  const b=button('',()=>{if((count.get(c.id)||0)>=3)return;const part=c.kind==='fusion'?'extra':'main';if(editor[part].length<60){editor[part].push(c.id);renderDeck();}},'card');b.append(image(c.id),node('small',c.name),node('small',`+ Add · ${count.get(c.id)||0}/3`));b.setAttribute('aria-label','Add '+c.name);$('library').append(b);
 }
 for(const [id,n] of [...count].sort((a,b)=>cards.get(a[0]).name.localeCompare(cards.get(b[0]).name))){const c=cards.get(id),b=button('',()=>{const part=c.kind==='fusion'?'extra':'main';editor[part].splice(editor[part].indexOf(id),1);renderDeck();},'card');b.append(image(id),node('small',c.name),node('small',`${n} copies · Remove`));$('deck-cards').append(b);}
}
function saveDeck(){try{deck=validateDeck(editor,catalog);localStorage.setItem('joey-fast-deck',json(deck));$('deck-dialog').close();status('Deck saved on this device.');}catch(error){$('deck-summary').textContent=error.message;}}
$('create').onclick=host;$('refresh').onclick=refresh;$('practice').onclick=practice;$('leave').onclick=()=>{if(confirm('Leave this duel? Your online room will close.'))leave();};
$('surrender').onclick=()=>{if(!view||!confirm('Surrender this duel?'))return;if(mode==='guest')roomService.send({kind:'surrender'});else worker.postMessage({kind:'surrender',player:view.viewer});};
$('edit-deck').onclick=editDeck;$('search').oninput=renderDeck;$('reset-deck').onclick=()=>{editor=structuredClone(catalog.starter);renderDeck();};$('save-deck').onclick=saveDeck;
$('export-deck').onclick=()=>{const url=URL.createObjectURL(new Blob([json(editor)],{type:'application/json'})),a=node('a');a.href=url;a.download='joey-fast-deck.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('import-deck').onchange=async event=>{try{const file=event.target.files[0];if(!file)return;if(file.size>16384)throw Error('This deck file is too large.');editor=validateDeck(JSON.parse(await file.text()),catalog);renderDeck();}catch(error){$('deck-summary').textContent=error.message;}event.target.value='';};
for(const dialog of document.querySelectorAll('dialog'))dialog.querySelector('.close').onclick=()=>dialog.close();
window.joeyBack=()=>{const open=document.querySelector('dialog[open]');if(open){open.close();return true;}return false;};
window.addEventListener('pagehide',()=>roomService.close());
init();

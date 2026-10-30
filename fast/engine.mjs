// AGPL-3.0-or-later. The real OCG rules engine; no Windows or CPU emulation.
import createCore,{OcgDuelMode as Mode,OcgLocation as L,OcgPosition as P,OcgMessageType as M,OcgProcessResult as Result} from 'ocgcore-wasm';
import {choices,validateChoice} from './prompts.mjs';
import {validateDeck} from './deck.mjs';
export {validateDeck} from './deck.mjs';

const PROMPTS=new Set([10,11,12,13,14,15,16,18,19,20,21,22,23,24,25,26,132,140,141,142,143]);
// The upstream wrapper does not decode QUERY_TYPE; type comes from our catalog.
const QUERY=1|2|16|256|512|0x100000|0x1000000;
export class DuelSession{
 static async create(rules,catalog,wasmBinary){
  const started=performance.now();
  const core=await createCore({sync:true,...(wasmBinary?{wasmBinary}:{locateFile:()=>new URL('./engine.wasm',import.meta.url).href})});
  return new DuelSession(core,rules,catalog,performance.now()-started);
 }
 constructor(core,rules,catalog,initMs){this.core=core;this.rules=rules;this.catalog=catalog;this.initMs=initMs;this.handle=null;this.metrics={initMs,processMs:[],responses:0};}
 start(decks,seed){
  if(this.handle)this.core.destroyDuel(this.handle);
  this.lp=[8000,8000];this.turn=0;this.phase=0;this.turnNumber=0;this.prompt=null;this.previousPrompt=null;this.revision=0;this.winner=null;this.log=[];this.errors=[];
  const options={startingLP:8000,startingDrawCount:5,drawCountPerTurn:1};
  this.stage='create duel';this.handle=this.core.createDuel({flags:Mode.MODE_GOAT,seed:seed||Array.from(crypto.getRandomValues(new Uint32Array(4)),v=>BigInt(v)+1n),team1:options,team2:options,
   cardReader:code=>{const c=this.rules.cards[code];return c?{...c,race:BigInt(c.race)}:null;},
   scriptReader:name=>this.rules.scripts[name]??null,
   errorHandler:(type,text)=>{if(type===0)this.errors.push(String(text));}
  });
  if(!this.handle)throw Error('The duel engine could not start.');
  for(const name of ['constant.lua','utility.lua']){this.stage='load '+name;if(!this.core.loadScript(this.handle,name,this.rules.scripts[name]))throw Error('Unable to load duel rules: '+name);}
  for(let player=0;player<2;player++){
   const deck=validateDeck(decks[player],this.catalog);
   for(const [part,location] of [['main',L.DECK],['extra',L.EXTRA]])for(const code of deck[part]){this.stage='add card '+code;this.core.duelNewCard(this.handle,{team:player,duelist:0,code,controller:player,location,sequence:0,position:P.FACEDOWN_DEFENSE});}
  }
  this.stage='start duel';this.core.startDuel(this.handle);return this.advance();
 }
 advance(){
  const before=performance.now();let status,iterations=0;this.prompt=null;
  do{
   if(++iterations>10000)throw Error('The duel did not reach a decision.');
   this.stage='process rules';status=this.core.duelProcess(this.handle);this.stage='read decisions';
   for(const m of this.core.duelGetMessage(this.handle)){
    if(PROMPTS.has(m.type)){this.prompt=m;this.previousPrompt=m;}
    if(m.type===M.RETRY){this.prompt=this.previousPrompt;this.notice='That selection is not valid. Please choose again.';}
    if(m.type===M.NEW_TURN){this.turn=m.player;this.turnNumber++;this.log.push(`Turn ${this.turnNumber}: Player ${m.player+1}`);}
    if(m.type===M.NEW_PHASE)this.phase=m.phase;
    if(m.type===M.DAMAGE||m.type===M.PAY_LPCOST)this.lp[m.player]=Math.max(0,this.lp[m.player]-m.amount);
    if(m.type===M.RECOVER)this.lp[m.player]+=m.amount;
    if(m.type===M.LPUPDATE)this.lp[m.player]=m.lp;
    if(m.type===M.WIN){this.winner=m.player;this.log.push(m.player<2?`Player ${m.player+1} wins.`:'The duel is a draw.');}
    if(m.type===M.SUMMONING||m.type===M.SPSUMMONING||m.type===M.FLIPSUMMONING)this.log.push(`${this.rules.texts[m.code]?.name||'A monster'} was summoned.`);
    if(m.type===M.DRAW)this.log.push(`Player ${m.player+1} drew ${m.cards?.length||1} card(s).`);
   }
  }while(status===Result.CONTINUE);
  this.log=this.log.slice(-10);this.revision++;this.metrics.processMs.push(performance.now()-before);
  if(this.errors.length)throw Error('The card rules reported an error: '+this.errors.slice(-2).join('; '));
  if(status===Result.WAITING&&!this.prompt)throw Error('The rules engine requested an unsupported decision.');
  this.stage='query field';return this.views();
 }
 respond(player,revision,response){
  if(this.winner!==null||!this.prompt||this.prompt.player!==player||revision!==this.revision)throw Error('Wait for your current choice.');
  validateChoice(choices(this.prompt,this.rules.texts,this.catalog.cards),response);
  if(response.type===16)response={...response,races:response.races.map(BigInt)};
  this.notice='';this.core.duelSetResponse(this.handle,response);this.metrics.responses++;return this.advance();
 }
 surrender(player){if(this.winner===null){this.winner=1-player;this.prompt=null;this.revision++;this.log.push(`Player ${player+1} surrendered.`);}return this.views();}
 views(){return [this.view(0),this.view(1)];}
 view(viewer){
  const zones=[];
  for(let player=0;player<2;player++){
   const entry={lp:this.lp[player]};
   for(const [name,location] of [['hand',L.HAND],['monsters',L.MZONE],['spells',L.SZONE],['grave',L.GRAVE],['banished',L.REMOVED],['extra',L.EXTRA]]){
    entry[name]=this.core.duelQueryLocation(this.handle,{flags:QUERY,controller:player,location}).map((card,sequence)=>{
     if(!card)return null;
     const hidden=player!==viewer&&(name==='hand'||name==='extra'||((card.position&10)!==0&&name!=='grave'));
     return hidden?{hidden:true,position:card.position,sequence,location,controller:player}:{...card,sequence,location,controller:player};
    });
   }
   entry.deck=this.core.duelQueryCount(this.handle,player,L.DECK);zones.push(entry);
  }
  return {viewer,revision:this.revision,turn:this.turn,turnNumber:this.turnNumber,phase:this.phase,winner:this.winner,players:zones,prompt:this.prompt?.player===viewer?this.prompt:null,waitingFor:this.prompt?.player??null,notice:this.notice||'',log:this.log};
 }
}

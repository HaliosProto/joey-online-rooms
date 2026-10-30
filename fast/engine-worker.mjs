import {DuelSession} from './engine.mjs';
let session;
self.onmessage=async({data})=>{
 try{
  if(data.kind==='init'){
   const [rules,catalog]=await Promise.all(['rules.json','catalog.json'].map(name=>fetch(new URL(name,import.meta.url)).then(r=>{if(!r.ok)throw Error('Unable to download game rules.');return r.json();})));
   session=await DuelSession.create(rules,catalog);postMessage({kind:'ready',initMs:session.initMs});
  }else if(!session)throw Error('The game is still loading.');
  else if(data.kind==='start')postMessage({kind:'views',views:session.start(data.decks),metrics:session.metrics});
  else if(data.kind==='respond')postMessage({kind:'views',views:session.respond(data.player,data.revision,data.response),metrics:session.metrics});
  else if(data.kind==='surrender')postMessage({kind:'views',views:session.surrender(data.player),metrics:session.metrics});
 }catch(error){postMessage({kind:'error',message:String(error.message||error)});}
};

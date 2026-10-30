import {DuelSession} from './engine.mjs';
export async function qualify(){
 const [rules,catalog]=await Promise.all(['rules.json','catalog.json'].map(p=>fetch(new URL(p,import.meta.url)).then(r=>r.json())));
 const session=await DuelSession.create(rules,catalog);session.start([catalog.starter,catalog.starter]);
 for(const card of catalog.cards){session.core.duelNewCard(session.handle,{team:0,duelist:0,code:card.id,controller:0,location:32,sequence:0,position:1});if(session.errors.length)throw Error(card.name+': '+session.errors.join('; '));}
 const result={initializedOriginalCards:catalog.cards.length,originalEntries:catalog.originalCardEntries,initMs:session.initMs};session.core.destroyDuel(session.handle);return result;
}

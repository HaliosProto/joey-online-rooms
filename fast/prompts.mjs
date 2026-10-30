// Serializable choices keep remote actions tied to a specific engine revision.
export function choices(m,texts={},catalog=[]){
 if(!m)return {title:'Waiting for the other player',options:[]};
 const out={title:'Choose your action',options:[]};
 const add=(label,response,extra={})=>out.options.push({label,response,...extra});
 const name=c=>texts[c?.code]?.name||catalog.find(x=>x.id===c?.code)?.name||'Card';
 const desc=value=>{const id=BigInt(value||0),card=texts[Number(id>>4n)],line=card?.strings[Number(id&15n)];return line||card?.name||null;};
 const list=(values,label,type,action)=>values.forEach((card,index)=>add(`${label} ${name(card)}`,{type,action,index},{card:card.code}));
 const single=(label,type,key='index',value=0)=>add(label,{type,[key]:value});
 switch(m.type){
  case 11:
   out.title='Main phase';
   for(const [key,label,action] of [['summons','Summon',0],['special_summons','Special summon',1],['pos_changes','Change position:',2],['monster_sets','Set monster:',3],['spell_sets','Set',4],['activates','Activate',5]])list(m[key]||[],label,1,action);
   if(m.to_bp)add('Battle phase',{type:1,action:6,index:null},{phase:true});if(m.to_ep)add('End turn',{type:1,action:7,index:null},{phase:true});break;
  case 10:
   out.title='Battle phase';list(m.chains||[],'Activate',0,0);list(m.attacks||[],'Attack with',0,1);if(m.to_m2)add('Main phase 2',{type:0,action:2,index:null},{phase:true});if(m.to_ep)add('End turn',{type:0,action:3,index:null},{phase:true});break;
  case 12:case 13:
   out.title=desc(m.description)|| (m.code?`Use ${name(m)}?`:'Activate this effect?');add('Yes',{type:m.type===12?2:3,yes:true});add('No',{type:m.type===12?2:3,yes:false});break;
  case 14:out.title='Choose an effect';m.options.forEach((o,index)=>single(desc(o)||`Option ${index+1}`,4,'index',index));break;
  case 15:case 20:case 23:{
   const sum=m.type===23,tribute=m.type===20;out.title=sum?`Choose cards totaling ${m.amount}`:tribute?`Choose ${m.min} tribute(s)`:`Choose ${m.min}–${m.max} card(s)`;
   out.selection={type:sum?14:tribute?12:5,min:m.min,max:m.max,amount:sum?m.amount:null,must:sum?(m.selects_must||[]):[]};
   (m.selects||[]).forEach((card,index)=>out.options.push({label:name(card),card:card.code,index,amount:card.amount,release:card.release_param}));
   if(m.can_cancel)out.cancel={type:out.selection.type,indicies:null};break;}
  case 26:
   out.title='Choose a card';m.select_cards.forEach((c,index)=>add('Select '+name(c),{type:7,index},{card:c.code}));m.unselect_cards.forEach((c,index)=>add('Unselect '+name(c),{type:7,index:index+m.select_cards.length},{card:c.code}));if(m.can_finish||m.can_cancel)add(m.can_finish?'Done':'Cancel',{type:7,index:null});break;
  case 16:
   out.title='Respond to the last action';m.selects.forEach((c,index)=>add('Activate '+name(c),{type:8,index},{card:c.code}));if(!m.forced)add('Pass',{type:8,index:null});break;
  case 18:case 24:{
   out.title=m.type===18?'Choose a field slot':'Choose slots to disable';out.places={count:m.count,type:m.type===18?10:9};
   for(let relative=0;relative<2;relative++)for(const [location,offset,slots] of [[4,0,5],[8,8,6]])for(let sequence=0;sequence<slots;sequence++){
    const bit=relative*16+offset+sequence;if((m.field_mask&(1<<bit))===0){const place={player:(m.player+relative)%2,location,sequence};out.options.push({label:`${relative?'Opponent':'Your'} ${location===4?'monster':'spell/trap'} slot ${sequence+1}`,place});}
   }break;}
  case 19:
   out.title='Choose battle position';for(const [p,label] of [[1,'Face-up attack'],[4,'Face-up defense'],[8,'Face-down defense'],[2,'Face-down attack']])if(m.positions&p)single(label,11,'position',p);break;
  case 21:case 25:out.title='Choose the card order';out.order=true;m.cards.forEach((c,index)=>out.options.push({label:name(c),card:c.code,index}));break;
  case 22:out.title=`Remove ${m.count} counter(s)`;out.counters={count:m.count};m.cards.forEach((c,index)=>out.options.push({label:name(c),card:c.code,index,max:c.count}));break;
  case 132:out.title='Rock, paper, scissors';single('Rock',20,'value',2);single('Paper',20,'value',3);single('Scissors',20,'value',1);break;
  case 140:case 141:{
   const race=m.type===140;out.title=`Choose ${m.count} ${race?'monster type(s)':'attribute(s)'}`;out.flags={count:m.count,type:race?16:17,key:race?'races':'attributes'};
   const labels=race?['Warrior','Spellcaster','Fairy','Fiend','Zombie','Machine','Aqua','Pyro','Rock','Winged Beast','Plant','Insect','Thunder','Dragon','Beast','Beast-Warrior','Dinosaur','Fish','Sea Serpent','Reptile','Psychic','Divine-Beast','Creator God','Wyrm','Cyberse','Illusion']:['Earth','Water','Fire','Wind','Light','Dark','Divine'];
   labels.forEach((label,index)=>{if(BigInt(m.available)&(1n<<BigInt(index)))out.options.push({label,flag:race?String(1n<<BigInt(index)):1<<index});});break;}
  case 142:out.title='Declare a card';out.declare=true;out.options=catalog.map(c=>({label:c.name,card:c.id,response:{type:18,card:c.id}}));break;
  case 143:out.title='Choose a number';m.options.forEach((v,index)=>single(String(v),19,'value',index));break;
  default:throw Error('Unknown rules decision '+m.type);
 }
 return out;
}

export function validateChoice(plan,response){
 if(!response||typeof response!=='object')throw Error('Choose one of the available actions.');
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 if(plan.options.some(x=>x.response&&same(x.response,response))||plan.cancel&&same(plan.cancel,response))return;
 const integers=a=>Array.isArray(a)&&a.every(Number.isInteger)&&new Set(a).size===a.length;
 if(plan.selection&&response.type===plan.selection.type){const a=response.indicies;if(integers(a)&&a.length<=(plan.selection.max||60)&&a.every(i=>i>=0&&i<plan.options.length+(plan.selection.must?.length||0)))return;}
 if(plan.flags&&response.type===plan.flags.type){const a=response[plan.flags.key];if(Array.isArray(a)&&a.length===plan.flags.count&&new Set(a.map(String)).size===a.length&&a.every(v=>plan.options.some(x=>String(x.flag)===String(v))))return;}
 if(plan.places&&response.type===plan.places.type){const a=response.places;if(Array.isArray(a)&&a.length===plan.places.count&&new Set(a.map(JSON.stringify)).size===a.length&&a.every(v=>plan.options.some(x=>same(x.place,v))))return;}
 if(plan.order&&response.type===15&&integers(response.order)&&response.order.length===plan.options.length&&response.order.every(i=>i>=0&&i<plan.options.length))return;
 if(plan.counters&&response.type===13){const a=response.counters;if(Array.isArray(a)&&a.length===plan.options.length&&a.every((v,i)=>Number.isInteger(v)&&v>=0&&v<=plan.options[i].max)&&a.reduce((s,x)=>s+x,0)===plan.counters.count)return;}
 throw Error('That action is not available for this decision.');
}

import {chromium,webkit} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve('fast-build');await mkdir('fast-results',{recursive:true});
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.webp':'image/webp','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{try{let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/fast\//,'/');if(path==='/')path='/index.html';const file=resolve(root,'.'+path);if(!file.startsWith(root+sep))throw Error();const info=await stat(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Content-Length':info.size});res.end(await readFile(file));}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(8765,'127.0.0.1',r));
const browser=await(process.env.FAST_BROWSER==='webkit'?webkit:chromium).launch({headless:true});const errors=[],logs=[];
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await context.addInitScript(()=>{globalThis.JOEY_TEST_ENDPOINT='http://127.0.0.1:8787';});
const page=await context.newPage();const guest=await context.newPage();
for(const [p,label] of [[page,'host'],[guest,'guest']]){p.on('pageerror',e=>errors.push(label+': '+e.stack));p.on('console',m=>{if(m.type()==='error')logs.push(label+': '+m.text());});}
async function load(p,name){await p.goto('http://127.0.0.1:8765/fast/');await p.locator('#lobby').waitFor();await p.locator('#player-name').fill(name);}
async function state(p){return p.evaluate(()=>window.joeyState);}
async function choose(p,index){
 const option=await p.evaluate(i=>window.joeyPlan.options[i],index);
 let b=p.locator(`#decisions [data-choice="${index}"]`);
 if(!await b.count()&&option.card){
  const byCode=await p.locator('#hand button').evaluateAll((nodes,code)=>nodes.findIndex(n=>n.querySelector('img')?.getAttribute('src')?.includes('/'+code+'.')),option.card);
  if(byCode>=0)await p.locator('#hand button').nth(byCode).click();else{const slot=p.locator('#board button').filter({has:p.locator(`img[src$="/${option.card}.webp"]`)}).first();await slot.click();}
  b=p.locator(`#card-dialog [data-choice="${index}"]`);
 }
 await b.click();
}
async function drive(p){
 const data=await p.evaluate(()=>({view:window.joeyState,plan:window.joeyPlan}));const {view,plan}=data;if(!view?.prompt)return false;
 let index=0;
 if(view.prompt.type===11){index=plan.options.findIndex(o=>o.label.startsWith('Summon '));if(index<0)index=plan.options.findIndex(o=>o.label==='Battle phase');if(index<0)index=plan.options.findIndex(o=>o.label==='End turn');}
 else if(view.prompt.type===10){index=plan.options.findIndex(o=>o.label.startsWith('Attack with '));if(index<0)index=plan.options.findIndex(o=>o.label==='End turn');}
 else if(plan.selection){const count=Math.max(plan.selection.min,1);for(let i=0;i<count&&i<plan.options.length;i++)await p.locator(`#decisions [data-choice="${i}"]`).click();await p.getByRole('button',{name:'Confirm selection',exact:true}).click();return true;}
 else if(plan.places){for(let i=0;i<plan.places.count;i++)await p.locator(`#decisions [data-choice="${i}"]`).click();if(plan.places.count!==1)await p.getByRole('button',{name:'Confirm selection',exact:true}).click();return true;}
 else if(view.prompt.type===16){index=plan.options.findIndex(o=>o.label==='Pass');if(index<0)index=0;}
 else if(view.prompt.type===13||view.prompt.type===12){index=plan.options.findIndex(o=>o.label==='Yes');}
 else if(view.prompt.type===19){index=plan.options.findIndex(o=>o.label==='Face-up attack');if(index<0)index=0;}
 if(index<0)throw Error('No test action for prompt '+JSON.stringify(view.prompt));await choose(p,index);return true;
}
try{
 await load(page,'Cloud Host');await page.screenshot({path:'fast-results/lobby.png',fullPage:true});
 const effectInit=await page.evaluate(async()=>{const {qualify}=await import('./qualification.mjs');return await qualify();});
 await writeFile('fast-results/card-initializers.json',JSON.stringify(effectInit));
 const catalog=JSON.parse(await readFile('fast-build/catalog.json','utf8')),rules=JSON.parse(await readFile('fast-build/rules.json','utf8'));
 // Normal monsters isolate actual summon, tribute-free placement, battle and win flow.
 const normals=catalog.cards.filter(c=>c.kind==='monster'&&c.level<=4&&(rules.cards[c.id]?.type&16)&&c.attack>0).slice(0,20);const main=normals.flatMap(c=>[c.id,c.id]).slice(0,40);if(main.length!==40)throw Error('Missing qualification deck');
 for(const p of [page,guest])await p.addInitScript(deck=>localStorage.setItem('joey-fast-deck',JSON.stringify(deck)),{main,extra:[]});
 await page.reload();await page.locator('#lobby').waitFor();await page.locator('#player-name').fill('Cloud Host');await page.locator('#room-name').fill('Fast original-card test');const start=Date.now();await page.locator('#create').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Waiting for your friend'),{timeout:30000});
 await load(guest,'Cloud Guest');await guest.locator('.room').filter({hasText:'Fast original-card test'}).click();await guest.waitForFunction(()=>Boolean(window.joeyState),{timeout:30000});
 const initial=await state(page);if(!initial?.prompt)await page.waitForFunction(()=>Boolean(window.joeyState?.prompt||window.joeyState?.waitingFor===1));
 await page.screenshot({path:'fast-results/host-start.png',fullPage:true});await guest.screenshot({path:'fast-results/guest-start.png',fullPage:true});
 let actions=0,prior=-1,stuck=0;const until=Date.now()+180000;
 while(Date.now()<until&&actions<600){
  const hostState=await state(page);if(hostState?.winner!==null&&hostState?.winner!==undefined)break;
  if(!hostState){await page.waitForTimeout(50);continue;}
  if(hostState.revision===prior){if(++stuck>100)throw Error('Game stalled: '+JSON.stringify({state:hostState,status:await page.locator('#status').textContent(),guestStatus:await guest.locator('#status').textContent()}));await page.waitForTimeout(60);continue;}
  prior=hostState.revision;stuck=0;const active=hostState.waitingFor===0?page:guest;
  await active.waitForFunction(rev=>window.joeyState?.revision===rev&&Boolean(window.joeyState.prompt),hostState.revision);
  await drive(active);actions++;await page.waitForTimeout(25);
  if(actions===10){await page.screenshot({path:'fast-results/host-playing.png',fullPage:true});await guest.screenshot({path:'fast-results/guest-playing.png',fullPage:true});}
 }
 const end=await state(page);if(end?.winner===null||end?.winner===undefined)throw Error('The qualification duel did not finish');
 if((await state(guest)).winner!==end.winner)throw Error('The clients disagree on the winner');
 await page.screenshot({path:'fast-results/winner.png',fullPage:true});
 const measurements=await page.evaluate(async()=>{const gaps=[];let last=performance.now();await new Promise(resolve=>{let n=0;function frame(now){gaps.push(now-last);last=now;if(++n<90)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});gaps.sort((a,b)=>a-b);return {...window.joeyMetrics,frameP95:gaps[Math.floor(gaps.length*.95)]};});
 await writeFile('fast-results/result.json',JSON.stringify({engine:process.env.FAST_BROWSER||'chromium',actions,winner:end.winner,elapsedMs:Date.now()-start,measurements,errors,logs},null,2));
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS: original-card summon, battle, remote decisions and completed duel.',JSON.stringify({actions,winner:end.winner,engineInitMs:measurements.engineInitMs,frameP95:measurements.frameP95}));
}finally{await writeFile('fast-results/errors.txt',[...errors,...logs].join('\n'));await page.screenshot({path:'fast-results/final-host.png',fullPage:true}).catch(()=>{});await guest.screenshot({path:'fast-results/final-guest.png',fullPage:true}).catch(()=>{});await browser.close();server.close();}

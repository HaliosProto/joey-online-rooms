import {PNG} from 'pngjs';
import {chromium,webkit} from 'playwright';
import {createServer} from 'node:http';import{createReadStream,statSync,mkdirSync,writeFileSync}from'node:fs';import{resolve,extname,sep}from'node:path';
function imageChange(a,b,rect){if(a.width!==b.width||a.height!==b.height)return 1;let n=0,total=0;for(let y=Math.floor(a.height*rect[1]);y<a.height*rect[3];y++)for(let x=Math.floor(a.width*rect[0]);x<a.width*rect[2];x++){const at=(y*a.width+x)*4;if(Math.abs(a.data[at]-b.data[at])+Math.abs(a.data[at+1]-b.data[at+1])+Math.abs(a.data[at+2]-b.data[at+2])>90)n++;total++;}return n/total;}
function menuWood(image){let brown=0,total=0;for(let y=Math.floor(image.height*.54);y<image.height*.94;y++)for(let x=Math.floor(image.width*.25);x<image.width*.75;x++){const at=(y*image.width+x)*4,r=image.data[at],g=image.data[at+1],b=image.data[at+2];if(r>90&&r>g*1.1&&g>b*1.2)brown++;total++;}return brown/total;}
const root=resolve('mobile-web');mkdirSync('mobile-test-results',{recursive:true});
const types={'.wasm':'application/wasm','.js':'text/javascript','.html':'text/html','.css':'text/css','.zip':'application/zip','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
const server=createServer((req,res)=>{let relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(relative==='/')relative='/index.html';const path=resolve(root,'.'+relative);if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}try{res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Content-Length':statSync(path).size});createReadStream(path).pipe(res);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(8765,'127.0.0.1',r));const engine=process.env.MOBILE_BROWSER==='webkit'?webkit:chromium;const browser=await engine.launch({headless:true,...(engine===chromium?{args:['--enable-unsafe-swiftshader','--no-sandbox']}: {})});const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();const logs=[],errors=[];const roomPosts=[],roomResponses=[];page.on('response',async response=>{if(response.request().method()==='POST'&&new URL(response.url()).pathname==='/v1/rooms'){roomResponses.push({status:response.status(),error:response.status()>=400?await response.text():undefined});}});page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/v1/rooms'){const body=request.postDataBuffer();if(body?.length>=20)roomPosts.push({url:request.url(),app:body.subarray(4,20).toString('hex'),flags:body.readUInt32LE(20),name:body.toString('utf16le',26,26+body.readUInt16LE(24)*2),bytes:body.length});}});page.on('console',m=>{logs.push(m.text());if(logs.length%100===0)console.log(logs.slice(-3).join('\n'));});page.on('pageerror',e=>errors.push(e.stack));
try{
 // Apply the isolated endpoint before the iframe can initialize its socket transport.
 if(process.env.TEST_SERVER)await context.addInitScript(endpoint=>{
  let module;
  Object.defineProperty(window,'Module',{configurable:true,get:()=>module,set:value=>{
   module=value;if(value&&typeof value==='object')value['joeyCloudOrigin']=endpoint;
  }});
 },process.env.TEST_SERVER);
 await page.goto('http://127.0.0.1:8765/');await page.screenshot({path:'mobile-test-results/install.png',fullPage:true});
 await page.locator('#prepare').click();const ready=Date.now()+240000;while(Date.now()<ready && await page.locator('#prepare').textContent()!=='Start game'){const status=await page.locator('#message').textContent();console.log('Download:',status);if(await page.locator('#prepare').textContent()==='Try again')throw new Error(status);await new Promise(r=>setTimeout(r,3000));}if(await page.locator('#prepare').textContent()!=='Start game')throw new Error('Game download did not complete');
 await page.setViewportSize({width:844,height:390});await page.getByRole('button',{name:'Start game',exact:true}).click();
 const until=Date.now()+12*60000;while(Date.now()<until&&!logs.some(l=>l.includes('integrated cloud networking enabled'))){if(errors.length)throw new Error(errors.join('\n'));await new Promise(r=>setTimeout(r,10000));}
 if(!logs.some(l=>l.includes('integrated cloud networking enabled')))throw new Error('Mobile interface did not start the original game');
 await new Promise(r=>setTimeout(r,5000));
 const frame=page.frames().find(f=>f.url().includes('boxedwine.html'));if(!frame)throw new Error('Missing game frame');
 // Touch input must arrive as real mouse events at the emulator's scaled canvas.
 await frame.evaluate(()=>{window.testTouch=[];const native=Module['_boxedwineEmscriptenMouseButton'];if(typeof native!=='function')throw new Error('Native input API missing');Module['_boxedwineEmscriptenMouseButton']=function(down,button,x,y){window.testTouch.push({type:down?'mousedown':'mouseup',button,x,y,time:performance.now()});return native(down,button,x,y);};});
 const canvas=frame.locator('#canvas'),box=await canvas.boundingBox();await page.touchscreen.tap(box.x+box.width*.5,box.y+box.height*.25);await new Promise(r=>setTimeout(r,5000));await page.touchscreen.tap(box.x+box.width*.5,box.y+box.height*.25);await new Promise(r=>setTimeout(r,5000));let before,previous;const menuReadyUntil=Date.now()+60000;
 while(Date.now()<menuReadyUntil){const shot=PNG.sync.read(await canvas.screenshot());const wood=menuWood(shot),movement=previous?imageChange(previous,shot,[.12,.08,.88,.48]):1,menuMovement=previous?imageChange(previous,shot,[.25,.54,.75,.94]):1;console.log('Main menu readiness:',{wood,movement,menuMovement});if(wood>.25&&movement<.01&&menuMovement<.015){before=shot;break;}previous=shot;await new Promise(r=>setTimeout(r,700));}
 if(!before)throw new Error('Original game main menu did not finish its initial animation');await page.screenshot({path:'mobile-test-results/mobile-main-menu.png'});await page.touchscreen.tap(box.x+box.width*.5,box.y+box.height*.57);await new Promise(r=>setTimeout(r,8000));await page.screenshot({path:'mobile-test-results/mobile-duel-mode.png'});
 const after=PNG.sync.read(await canvas.screenshot());
 const logoChange=imageChange(before,after,[.12,.08,.88,.48]),menuChange=imageChange(before,after,[.25,.75,.75,.94]);console.log('Rendered menu transition:',{logoChange,menuChange});
 if(logoChange>.02||menuChange<.08)throw new Error('Touch did not open Duel Mode while preserving the game logo');

 await page.touchscreen.tap(box.x+box.width*.5,box.y+box.height*.90);await new Promise(r=>setTimeout(r,4000));await page.screenshot({path:'mobile-test-results/two-player-data.png'});await page.touchscreen.tap(box.x+box.width*.36,box.y+box.height*.82);await new Promise(r=>setTimeout(r,7000));await page.screenshot({path:'mobile-test-results/network-setup.png'});await page.touchscreen.tap(box.x+box.width*.18,box.y+box.height*.57);await new Promise(r=>setTimeout(r,6000));await page.screenshot({path:'mobile-test-results/network-after-name.png'});await page.touchscreen.tap(box.x+box.width*.53,box.y+box.height*.28);await new Promise(r=>setTimeout(r,4000));await page.screenshot({path:'mobile-test-results/host-selected.png'});await page.touchscreen.tap(box.x+box.width*.18,box.y+box.height*.57);await new Promise(r=>setTimeout(r,7000));await page.screenshot({path:'mobile-test-results/host-lobby.png'});writeFileSync('mobile-test-results/room-requests.json',JSON.stringify({requests:roomPosts,responses:roomResponses}));if(!roomResponses.some(r=>r.status===201))throw new Error('Original game could not create a room: '+JSON.stringify(roomResponses));
 const roomList=await fetch((process.env.TEST_SERVER||'https://joey-online-rooms.joey-online-rooms.workers.dev')+'/v1/rooms?app='+roomPosts.at(-1).app);const roomBytes=Buffer.from(await roomList.arrayBuffer());
 writeFileSync('mobile-test-results/room-list.json',JSON.stringify({status:roomList.status,bytes:roomBytes.length,prefix:roomBytes.subarray(0,8).toString('hex')}));
 if(!roomList.ok||roomBytes.length<4||roomBytes.readUInt32LE(0)<1)throw new Error('The room created by the original game is not publicly listed');
 if(process.env.MOBILE_PAIR==='true'){
  // A second independent emulator instance uses the cached immutable game download.
  // Save/load concurrency is outside this check; neither instance saves a duel.
  const guest=await context.newPage(),guestLogs=[],guestErrors=[],guestLists=[];
  guest.on('console',m=>guestLogs.push(m.text()));guest.on('pageerror',e=>guestErrors.push(e.stack));
  guest.on('response',async response=>{if(response.request().method()==='GET'&&new URL(response.url()).pathname==='/v1/rooms'){const bytes=await response.body();guestLists.push({status:response.status(),count:bytes.length>=4?bytes.readUInt32LE(0):-1});}});
  try{
   await guest.goto('http://127.0.0.1:8765/');await guest.locator('#prepare').click();await guest.getByRole('button',{name:'Start game',exact:true}).waitFor({timeout:240000});await guest.setViewportSize({width:844,height:390});await guest.getByRole('button',{name:'Start game',exact:true}).click();
   const guestUntil=Date.now()+12*60000;while(Date.now()<guestUntil&&!guestLogs.some(l=>l.includes('integrated cloud networking enabled'))){if(guestErrors.length)throw new Error(guestErrors.join('\n'));await new Promise(r=>setTimeout(r,10000));}
   if(!guestLogs.some(l=>l.includes('integrated cloud networking enabled')))throw new Error('Second original game did not start');await new Promise(r=>setTimeout(r,5000));
   const guestFrame=guest.frames().find(f=>f.url().includes('boxedwine.html')),guestCanvas=guestFrame.locator('#canvas'),gbox=await guestCanvas.boundingBox();
   const tap=async(x,y,delay=5000)=>{await guest.touchscreen.tap(gbox.x+gbox.width*x,gbox.y+gbox.height*y);await new Promise(r=>setTimeout(r,delay));};
   await tap(.5,.25);await tap(.5,.25);let prior,menu=false;const until=Date.now()+60000;
   while(Date.now()<until){const shot=PNG.sync.read(await guestCanvas.screenshot());if(prior&&menuWood(shot)>.25&&imageChange(prior,shot,[.12,.08,.88,.48])<.01&&imageChange(prior,shot,[.25,.54,.75,.94])<.015){menu=true;break;}prior=shot;await new Promise(r=>setTimeout(r,700));}
   if(!menu)throw new Error('Second original game menu did not settle');
   await tap(.5,.57,8000);await tap(.5,.90,4000);await tap(.36,.82,7000);await tap(.18,.57,6000);await tap(.81,.28,4000);await tap(.18,.57,12000);
   await guest.screenshot({path:'mobile-test-results/guest-room-list.png'});await page.screenshot({path:'mobile-test-results/host-with-guest-browser.png'});
   if(!guestLists.some(x=>x.status===200&&x.count>=1))throw new Error('Original Guest screen did not discover the other original game room');
   if(guestErrors.length||guestLogs.some(l=>/Unhandled page fault|Unhandled exception|starting debugger/.test(l)))throw new Error('Original Guest flow crashed: '+guestErrors.join('\n'));
   await tap(.67,.18,3000);await tap(.18,.57,15000);
   await guest.screenshot({path:'mobile-test-results/guest-connected.png'});await page.screenshot({path:'mobile-test-results/host-connected.png'});
   const joinedResponse=await fetch(process.env.TEST_SERVER+'/v1/rooms?app='+roomPosts.at(-1).app),joinedBytes=Buffer.from(await joinedResponse.arrayBuffer());
   const players=joinedBytes.length>=48&&joinedBytes.readUInt32LE(0)===1?joinedBytes.readUInt32LE(44):0;
   writeFileSync('mobile-test-results/guest-result.json',JSON.stringify({lists:guestLists,players}));
   if(players!==2)throw new Error('The two original games did not remain connected to the same room');
   if(guestLogs.some(l=>/Unhandled page fault|Unhandled exception|starting debugger/.test(l)))throw new Error('Guest crashed after selecting a room');
  }finally{writeFileSync('mobile-test-results/guest-browser.txt',guestLogs.join('\n')+'\n'+guestErrors.join('\n'));await guest.screenshot({path:'mobile-test-results/guest-final.png'}).catch(()=>{});await guest.close();}
 }
 const events=await frame.evaluate(()=>({events:window.testTouch,controls:typeof window.joeyKey,canvas:document.getElementById('canvas').getBoundingClientRect().toJSON()}));console.log('Touch diagnostics:',JSON.stringify(events));const touchEvents=events.events;if(!touchEvents.some(e=>e.type==='mousedown'&&e.button===0)||!touchEvents.some(e=>e.type==='mouseup'))throw new Error('Touch did not create complete mouse input');
 await page.locator('#right').click();await page.touchscreen.tap(box.x+box.width*.5,box.y+box.height*.5);await new Promise(r=>setTimeout(r,800));if(await page.locator('#right').getAttribute('aria-pressed')!=='false')throw new Error('One-shot right click did not reset');
 // The game's Wine prefix uses persistent storage rather than memory-only launch.
 if(!logs.some(l=>l.includes('Use Root FS storage mode: INDEXED_DB')))throw new Error('Game saves are not configured for persistent storage');
 await page.locator('#name').click();await page.locator('#typed').fill('Friend');await page.locator('#send-text').click();await page.locator('#back').click();
 if(logs.some(l=>/Unhandled page fault|Unhandled exception|starting debugger/.test(l)))throw new Error('Original game crashed while entering multiplayer');
 if(errors.length)throw new Error(errors.join('\n'));writeFileSync('mobile-test-results/site-result.txt','PASS: installed-style mobile UI downloads and caches assets, launches original game with persistent storage, forwards left/right touch input, and creates a publicly listed room from the original Host screen. Physical devices and complete duels remain unverified.\n');
}finally{writeFileSync('mobile-test-results/site-browser.txt',logs.join('\n')+'\n'+errors.join('\n'));await page.screenshot({path:'mobile-test-results/site-final.png'}).catch(()=>{});await browser.close();server.close();}

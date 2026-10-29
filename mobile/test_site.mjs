import {chromium} from 'playwright';
import {createServer} from 'node:http';import{createReadStream,statSync,mkdirSync,writeFileSync}from'node:fs';import{resolve,extname,sep}from'node:path';
const root=resolve('mobile-web');mkdirSync('mobile-test-results',{recursive:true});
const types={'.wasm':'application/wasm','.js':'text/javascript','.html':'text/html','.css':'text/css','.zip':'application/zip','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
const server=createServer((req,res)=>{let relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(relative==='/')relative='/index.html';const path=resolve(root,'.'+relative);if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}try{res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Content-Length':statSync(path).size});createReadStream(path).pipe(res);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(8765,'127.0.0.1',r));const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader','--no-sandbox']});const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();const logs=[],errors=[];page.on('console',m=>logs.push(m.text()));page.on('pageerror',e=>errors.push(e.stack));
try{
 await page.goto('http://127.0.0.1:8765/');await page.screenshot({path:'mobile-test-results/install.png',fullPage:true});
 await page.locator('#prepare').click();await page.getByRole('button',{name:'Start game',exact:true}).waitFor({state:'visible',timeout:240000});
 await page.setViewportSize({width:844,height:390});await page.getByRole('button',{name:'Start game',exact:true}).click();
 const until=Date.now()+12*60000;while(Date.now()<until&&!logs.some(l=>l.includes('integrated cloud networking enabled'))){if(errors.length)throw new Error(errors.join('\n'));await new Promise(r=>setTimeout(r,10000));}
 if(!logs.some(l=>l.includes('integrated cloud networking enabled')))throw new Error('Mobile interface did not start the original game');
 await new Promise(r=>setTimeout(r,35000));await page.screenshot({path:'mobile-test-results/mobile-main-menu.png'});
 const frame=page.frames().find(f=>f.url().includes('boxedwine.html'));if(!frame)throw new Error('Missing game frame');
 // Touch input must arrive as real mouse events at the emulator's scaled canvas.
 await frame.evaluate(()=>{window.testTouch=[];const c=document.getElementById('canvas');for(const type of ['mousedown','mouseup'])c.addEventListener(type,e=>window.testTouch.push({type,button:e.button}));});
 const canvas=frame.locator('#canvas'),box=await canvas.boundingBox();await page.touchscreen.tap(box.x+box.width*.5,box.y+box.height*.57);await new Promise(r=>setTimeout(r,8000));await page.screenshot({path:'mobile-test-results/mobile-duel-mode.png'});
 const events=await frame.evaluate(()=>window.testTouch);if(!events.some(e=>e.type==='mousedown'&&e.button===0)||!events.some(e=>e.type==='mouseup'))throw new Error('Touch did not create complete mouse input');
 await page.locator('#right').click();await page.touchscreen.tap(box.x+box.width*.5,box.y+box.height*.5);await new Promise(r=>setTimeout(r,200));if(await page.locator('#right').getAttribute('aria-pressed')!=='false')throw new Error('One-shot right click did not reset');
 // The game's Wine prefix uses persistent storage rather than memory-only launch.
 if(!logs.some(l=>l.includes('Use Root FS storage mode: INDEXED_DB')))throw new Error('Game saves are not configured for persistent storage');
 await page.locator('#name').click();await page.locator('#typed').fill('Friend');await page.locator('#send-text').click();await page.locator('#back').click();
 if(errors.length)throw new Error(errors.join('\n'));writeFileSync('mobile-test-results/site-result.txt','PASS: installed-style mobile UI downloads and caches assets, launches original game with persistent storage, and forwards left/right touch input. Physical devices and complete duels remain unverified.\n');
}finally{writeFileSync('mobile-test-results/site-browser.txt',logs.join('\n')+'\n'+errors.join('\n'));await page.screenshot({path:'mobile-test-results/site-final.png'}).catch(()=>{});await browser.close();server.close();}

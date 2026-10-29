import { chromium, webkit } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
const root=resolve('mobile-web');
mkdirSync('mobile-test-results',{recursive:true});
const types={'.wasm':'application/wasm','.js':'text/javascript','.html':'text/html','.css':'text/css','.zip':'application/zip'};
const server=createServer((req,res)=>{
  const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{
    const size=statSync(path).size;
    res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Content-Length':size,'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'});
    createReadStream(path).pipe(res);
  }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(8765,'127.0.0.1',r));
const engine=process.env.MOBILE_BROWSER==='webkit'?webkit:chromium;
const browser=await engine.launch({headless:true,...(engine===chromium?{args:['--enable-unsafe-swiftshader','--no-sandbox']}: {})});
const page=await browser.newPage({viewport:{width:1000,height:760}});
let lines=[];let errors=[];
page.on('console',m=>{lines.push(m.text()); if(lines.length%100===0) console.log(lines.slice(-3).join('\n'));});
page.on('pageerror',e=>{errors.push(e.stack||String(e));console.error('Page error:',e.stack||String(e));});
page.on('crash',()=>errors.push('Browser page crashed'));
try{
 const check=process.env.MOBILE_CHECK==='network';
 const params=new URLSearchParams({root:'runtime',app:'game',p:check?'check-network.bat':'start-game.bat',w:'c:/files/joey','wine-override':'nomono','auto':'false',storage:'memory'});
 await page.goto('http://127.0.0.1:8765/boxedwine.html?'+params,{waitUntil:'domcontentloaded',timeout:60000});
 if(process.env.TEST_SERVER)await page.evaluate(url=>{Module['joeyCloudOrigin']=url;},process.env.TEST_SERVER);
 console.log('Controls:',await page.locator('button,input[type=button]').allTextContents());
 const readyUntil=Date.now()+180000;
 while(!(await page.locator('#startbtn').isVisible())&&Date.now()<readyUntil){if(errors.length)throw new Error(errors.join('\n'));await new Promise(r=>setTimeout(r,1000));}
 await page.locator('#startbtn').click();
 const until=Date.now()+12*60*1000;
 while(Date.now()<until){
   await new Promise(r=>setTimeout(r,10000));
   await page.screenshot({path:'mobile-test-results/game.png'});
   const recent=lines.slice(-8).join('\n');console.log('Browser progress:',recent.slice(-1200));
   if(lines.some(l=>l.includes(check?'PASS: native hosting':'integrated cloud networking enabled'))){
     await new Promise(r=>setTimeout(r,check?1000:30000));
     await page.screenshot({path:'mobile-test-results/game.png'});
     writeFileSync('mobile-test-results/result.txt',check?'PASS: native WinHTTP room operations through browser sockets.\n':'PASS: original game activated multiplayer in the browser emulator. Full duel and physical mobile devices unverified.\n');
     if(!check){const canvas=page.locator('#canvas');const box=await canvas.boundingBox();await page.mouse.click(box.x+box.width*.5,box.y+box.height*.57,{delay:150});await new Promise(r=>setTimeout(r,8000));await page.screenshot({path:'mobile-test-results/duel-mode.png'});}
     break;
   }
   if(lines.some(l=>l.includes('FAIL: ')||l.includes('JOEY_GAME_EXITED_')||l.includes("Can't recognize '")))throw new Error('Original game exited before multiplayer activated');
   if(errors.length)throw new Error(errors.join('\n'));
 }
 if(!lines.some(l=>l.includes(check?'PASS: native hosting':'integrated cloud networking enabled')))throw new Error('Game did not activate multiplayer within probe time limit');
}finally{
 writeFileSync('mobile-test-results/browser.txt',lines.join('\n')+'\n'+errors.join('\n'));
 await page.screenshot({path:'mobile-test-results/final.png'}).catch(()=>{});
 await browser.close();server.close();
}

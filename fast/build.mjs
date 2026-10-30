import {build} from 'esbuild';
import {resolve,join} from 'node:path';
import {mkdir,readFile,writeFile,cp,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const here=resolve(import.meta.dirname),root=resolve(here,'..'),out=join(root,'fast-build'),vendor=join(root,'fast-vendor'),assets=join(root,'fast-assets');
await mkdir(out,{recursive:true});await cp(assets,out,{recursive:true});await cp(join(here,'web'),out,{recursive:true});
const sourceNames=['app.mjs','rooms.mjs','engine.mjs','engine-worker.mjs','prompts.mjs','deck.mjs'];
const hash=createHash('sha256');for(const file of sourceNames)hash.update(await readFile(join(here,file)));for(const file of (await readdir(join(here,'web'))).sort())hash.update(await readFile(join(here,'web',file)));hash.update(await readFile(join(vendor,'lib/ocgcore.sync.wasm')));hash.update(await readFile(join(out,'catalog.json')));hash.update(await readFile(join(out,'rules.json')));const version=hash.digest('hex').slice(0,16);
await cp(join(vendor,'lib/ocgcore.sync.wasm'),join(out,'engine.wasm'));
const plugin={name:'pinned-core-and-versioned-data',setup(b){
 b.onResolve({filter:/^ocgcore-wasm$/},()=>({path:join(vendor,'src/index.ts')}));
 b.onResolve({filter:/^~\//},args=>({path:join(vendor,args.path.slice(2))}));
 b.onLoad({filter:/\.mjs$/},async args=>{
  if(!args.path.startsWith(here))return;
  let contents=await readFile(args.path,'utf8');for(const name of ['catalog.json','rules.json','./engine.wasm','./engine-worker.mjs'])contents=contents.replaceAll(`'${name}'`,`'${name}?v=${version}'`);
  return {contents,loader:'js'};
 });
}};
await build({entryPoints:{app:join(here,'app.mjs'),'engine-worker':join(here,'engine-worker.mjs'),qualification:join(here,'qualify-effects.mjs')},bundle:true,format:'esm',splitting:true,platform:'browser',target:['safari17','chrome119'],outdir:out,outExtension:{'.js':'.mjs'},loader:{'.wasm':'file'},plugins:[plugin],minify:true,metafile:false});
let html=await readFile(join(out,'index.html'),'utf8');html=html.replace('href="style.css"',`href="style.css?v=${version}"`).replace('src="app.mjs"',`src="app.mjs?v=${version}"`);await writeFile(join(out,'index.html'),html);
const urls=[];async function walk(dir,prefix=''){for(const entry of await readdir(dir,{withFileTypes:true})){const rel=prefix+entry.name;if(entry.isDirectory())await walk(join(dir,entry.name),rel+'/');else urls.push(rel);}}await walk(out);
await writeFile(join(out,'sw.js'),`const CACHE='joey-fast-${version}';const FILES=new Set(${JSON.stringify(urls)});self.addEventListener('install',e=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{const u=new URL(e.request.url),scope=new URL(self.registration.scope);if(e.request.method!=='GET'||u.origin!==scope.origin||!u.pathname.startsWith(scope.pathname))return;const path=u.pathname.slice(scope.pathname.length);if(!FILES.has(path)||path==='index.html')return;e.respondWith((async()=>{const c=await caches.open(CACHE),hit=await c.match(e.request);if(hit)return hit;const r=await fetch(e.request);if(r.ok)await c.put(e.request,r.clone());return r;})());});`);
await writeFile(join(out,'build.json'),JSON.stringify({version,engine:'OCGCore compiled directly to WebAssembly',source:'https://github.com/HaliosProto/joey-online-rooms/tree/main/fast',files:urls.length}));
await cp(join(vendor,'cpp/ygo/COPYING'),join(out,'OCGCore-COPYING.txt'));await cp(join(vendor,'LICENSE.md'),join(out,'Wrapper-LICENSE.txt'));await cp(join(vendor,'SOURCE-REVISIONS.txt'),join(out,'SOURCE-REVISIONS.txt'));await cp(join(here,'Toolset-LICENSE.txt'),join(out,'Toolset-LICENSE.txt'));
console.log('Built Joey Fast',version,'with',urls.length,'files.');

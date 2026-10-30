"""Refresh the original-game website without rebuilding or modifying game files."""
import argparse,hashlib,json,re,shutil
from pathlib import Path
from runtime_storage import tolerate_denied_storage
p=argparse.ArgumentParser();p.add_argument('--site',type=Path,required=True);a=p.parse_args();site=a.site
previous=(site/'sw.js').read_text(encoding='utf-8')
match=re.search(r'const VIRTUAL=(\{[^\n]*\});',previous)
if not match:raise ValueError('Missing original game archive mapping')
virtual=json.loads(match[1]);assert set(virtual)=={'game.zip','runtime.zip'}
for data in virtual.values():
    assert all((site/part).is_file() for part in data['parts'])
for f in Path(__file__).with_name('web').iterdir():shutil.copyfile(f,site/f.name)
shell=site/'boxedwine-shell.js';shell.write_text(tolerate_denied_storage(shell.read_text(encoding='utf-8')),encoding='utf-8')
# The runtime uses fetch() for ZIP loading. Intercept only the fixed packaged
# archives inside its own page, so browsers denying service workers still work.
hashes={}
for data in virtual.values():
    for part in data['parts']:
        with (site/part).open('rb') as stream:hashes[part]=hashlib.file_digest(stream,'sha256').hexdigest()
bridge=site/'game-archives.js';code=bridge.read_text(encoding='utf-8').replace('const ARCHIVES={};','const ARCHIVES='+json.dumps(virtual)+';').replace('const HASHES={};','const HASHES='+json.dumps(hashes)+';')
bridge_name='game-archives-'+hashlib.sha256(code.encode()).hexdigest()[:12]+'.js';(site/bridge_name).write_text(code,encoding='utf-8');bridge.unlink()
html=site/'boxedwine.html';content=html.read_text(encoding='utf-8');content=re.sub(r'<script src=["\']?game-archives-[^>]+></script>','',content)
if content.count('<script src=room-transport.js>')!=1:raise ValueError('Unexpected original runtime HTML')
content=content.replace('<script src=room-transport.js>',f'<script src="{bridge_name}"></script><script src=room-transport.js>');html.write_text(content,encoding='utf-8')
# Existing visitors may still have an older service worker or HTTP cache.
# Give changed runtime scripts new URLs without touching their saved game.
for stem in ('boxedwine-shell','game-controls'):
    source=site/(stem+'.js');target=stem+'-'+hashlib.sha256(source.read_bytes()).hexdigest()[:12]+'.js';shutil.copyfile(source,site/target)
    content,count=re.subn(r'<script src=["\']?'+stem+r'(?:-[a-f0-9]{12})?\.js["\']?>',f'<script src="{target}">',content)
    if count!=1:raise ValueError('Unexpected runtime script reference: '+stem)
html.write_text(content,encoding='utf-8')
for name in ('mobile.js','mobile.css'):
    source=site/name;target=f'mobile-{hashlib.sha256(source.read_bytes()).hexdigest()[:12]}{source.suffix}';source.rename(site/target)
    for page in ['index.html','licenses.html']:
        file=site/page;file.write_text(file.read_text(encoding='utf-8').replace(name,target),encoding='utf-8')
shutil.copyfile(site/'index.html',site/'legacy.html')
alternate=site/'fast/index.html'
if alternate.is_file():
    if not (site/'fast/experimental-client.html').exists():shutil.copyfile(alternate,site/'fast/experimental-client.html')
    alternate.write_text('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=../"><title>Original Joey the Passion</title></head><body><a href="../">Play the original Joey the Passion game</a></body></html>',encoding='utf-8')
manifest=[]
for f in sorted(site.iterdir()):
    if f.is_file() and (f.suffix in ('.js','.css','.wasm','.png') or '.part' in f.name) and f.name!='sw.js':
        with f.open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
        manifest.append({'path':f.name,'bytes':f.stat().st_size,'sha256':digest})
(site/'assets.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
sw=site/'sw.js';text=sw.read_text(encoding='utf-8').replace('const VIRTUAL={};','const VIRTUAL='+json.dumps(virtual)+';').replace('const ASSETS={};','const ASSETS='+json.dumps({f['path']:f['sha256'] for f in manifest})+';');sw.write_text(text,encoding='utf-8')
(site/'.nojekyll').touch()
print('Original game archives retained byte-for-byte. Website refreshed for one-click browser play.')

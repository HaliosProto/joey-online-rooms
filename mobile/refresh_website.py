"""Refresh the original-game website without rebuilding or modifying game files."""
import argparse,hashlib,json,re,shutil
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--site',type=Path,required=True);a=p.parse_args();site=a.site
previous=(site/'sw.js').read_text(encoding='utf-8')
match=re.search(r'const VIRTUAL=(\{[^\n]*\});',previous)
if not match:raise ValueError('Missing original game archive mapping')
virtual=json.loads(match[1]);assert set(virtual)=={'game.zip','runtime.zip'}
for data in virtual.values():
    assert all((site/part).is_file() for part in data['parts'])
for f in Path(__file__).with_name('web').iterdir():shutil.copyfile(f,site/f.name)
for name in ('mobile.js','mobile.css'):
    source=site/name;target=f'mobile-{hashlib.sha256(source.read_bytes()).hexdigest()[:12]}{source.suffix}';source.rename(site/target)
    for page in ['index.html','licenses.html']:
        file=site/page;file.write_text(file.read_text(encoding='utf-8').replace(name,target),encoding='utf-8')
shutil.copyfile(site/'index.html',site/'legacy.html')
manifest=[]
for f in sorted(site.iterdir()):
    if f.is_file() and (f.suffix in ('.js','.css','.wasm','.png') or '.part' in f.name) and f.name!='sw.js':
        with f.open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
        manifest.append({'path':f.name,'bytes':f.stat().st_size,'sha256':digest})
(site/'assets.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
sw=site/'sw.js';text=sw.read_text(encoding='utf-8').replace('const VIRTUAL={};','const VIRTUAL='+json.dumps(virtual)+';').replace('const ASSETS={};','const ASSETS='+json.dumps({f['path']:f['sha256'] for f in manifest})+';');sw.write_text(text,encoding='utf-8')
(site/'.nojekyll').touch()
print('Original game archives retained byte-for-byte. Website refreshed for one-click browser play.')

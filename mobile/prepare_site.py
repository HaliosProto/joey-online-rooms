"""Assemble the mobile site in cloud CI after the original-game probe passed."""
import argparse, hashlib, json, shutil, struct, subprocess, sys, zlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--engine',required=True);p.add_argument('--native',required=True);p.add_argument('--output',required=True);a=p.parse_args()
subprocess.run([sys.executable,str(Path(__file__).with_name('prepare_probe.py')),'--engine',a.engine,'--native',a.native,'--output',a.output],check=True)
out=Path(a.output)
for f in Path(__file__).with_name('web').iterdir():shutil.copyfile(f,out/f.name)
html=out/'boxedwine.html';s=html.read_text().replace('<title>BoxedWine</title>','<title>Joey Online game</title>');s=s.replace('</head>','<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover"><link href="game.css" rel="stylesheet"></head>');s=s.replace('<script src=boxedwine.js async>','<script src=game-controls.js></script><script src=boxedwine.js async>');html.write_text(s)
# Keep all shell controls available internally, including save export, while scaling the game.
for size in (192,512):
    pixels=bytearray()
    for y in range(size):
        pixels.append(0)
        for x in range(size):
            card=size*.25<x<size*.75 and size*.16<y<size*.84
            edge=card and (x<size*.28 or x>size*.72 or y<size*.19 or y>size*.81)
            j=(size*.43<x<size*.59 and size*.31<y<size*.65) or (size*.34<x<size*.59 and size*.61<y<size*.69) or (size*.34<x<size*.43 and size*.55<y<size*.65)
            pixels.extend((231,197,127) if edge or j else (24,36,59) if card else (11,18,32))
    def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(pixels))+chunk(b'IEND',b'')
    (out/f'icon-{size}.png').write_bytes(png)
# Browser caches handle small resumable files more reliably than a single 468 MB entry.
virtual={}
for name in ('game.zip','runtime.zip'):
    original=out/name;parts=[];size=original.stat().st_size
    with original.open('rb') as stream:
        index=0
        while data:=stream.read(16*1024*1024):
            part=f'{name}.part{index:03d}';(out/part).write_bytes(data);parts.append(part);index+=1
    virtual[name]={'parts':parts,'bytes':size};original.unlink()
sw=out/'sw.js';sw.write_text(sw.read_text().replace('const VIRTUAL={};','const VIRTUAL='+json.dumps(virtual)+';'))
# A new front-end filename reaches existing installations even before the new worker activates.
for name in ('mobile.js','mobile.css'):
    source=out/name;digest=hashlib.sha256(source.read_bytes()).hexdigest()[:12];target=f'mobile-{digest}{source.suffix}';source.rename(out/target)
    index=out/'index.html';index.write_text(index.read_text().replace(name,target))
    if name.endswith('.css'):
        credits=out/'licenses.html';credits.write_text(credits.read_text().replace(name,target))
manifest=[]
for f in sorted(out.iterdir()):
    if f.is_file() and (f.suffix in ('.js','.css','.wasm','.zip','.png') or '.part' in f.name) and f.name not in ('sw.js','online.zip'):
        with f.open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
        manifest.append({'path':f.name,'bytes':f.stat().st_size,'sha256':digest})
sw.write_text(sw.read_text().replace('const ASSETS={};','const ASSETS='+json.dumps({f['path']:f['sha256'] for f in manifest})+';'))
(out/'assets.json').write_text(json.dumps(manifest,indent=2))
(out/'.nojekyll').touch()
print('Site bytes:',sum(f.stat().st_size for f in out.iterdir() if f.is_file()),flush=True)

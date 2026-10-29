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
manifest=[]
for f in sorted(out.iterdir()):
    if f.is_file() and f.suffix in ('.js','.css','.wasm','.zip','.png') and f.name not in ('sw.js','online.zip'):
        with f.open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
        manifest.append({'path':f.name,'bytes':f.stat().st_size,'sha256':digest})
(out/'assets.json').write_text(json.dumps(manifest,indent=2))
(out/'.nojekyll').touch()
print('Site bytes:',sum(f.stat().st_size for f in out.iterdir() if f.is_file()),flush=True)

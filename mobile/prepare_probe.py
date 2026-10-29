"""Prepare a cloud-only original-game browser probe from pinned releases."""
import argparse
import hashlib
from pathlib import Path
import shutil
import urllib.request
import zipfile

p=argparse.ArgumentParser()
p.add_argument('--engine',type=Path,required=True)
p.add_argument('--native',type=Path,required=True)
p.add_argument('--output',type=Path,required=True)
a=p.parse_args()
a.output.mkdir(parents=True,exist_ok=True)
cache=a.output.parent/'mobile-downloads'
cache.mkdir(exist_ok=True)
def fetch(url,name,digest):
    path=cache/name
    with urllib.request.urlopen(url,timeout=60) as incoming,path.open('wb') as outgoing:
        shutil.copyfileobj(incoming,outgoing)
    with path.open('rb') as stream:
        actual=hashlib.file_digest(stream,'sha256').hexdigest()
    if actual!=digest: raise RuntimeError('Unexpected checksum: '+name)
    print('Verified:',name,actual,flush=True)
    return path
root=fetch('https://boxedwine.org/v2/23/TinyCore15Wine11.0-web.zip','runtime.zip','4d505092956dd78e36712dac8111c252e5d1b859ce2373fbe7c80242bb65ad47')
game=fetch('https://github.com/HaliosProto/joey-online-rooms/releases/download/full-game-preview-2/Joey-the-Passion-Online-Full-Game.zip','game.zip','f41c3e7203f7f1246c19c14f0abbbf4a23d687d2ed19c6738d7c1081cb747267')
for source in a.engine.iterdir():
    if source.is_file(): shutil.copyfile(source,a.output/source.name)
shell=a.output/'boxedwine-shell.js'
text=shell.read_text()
text=text.replace('Config.envProp = getEnvProp();', 'Config.envProp = "WINEDLLOVERRIDES=dinput=n,b;mscoree,mshtml=";')
text=text.replace('let params = ["-root", ROOT];', 'let params = ["-root", ROOT, "-env", "WINEDEBUG=+debugstr"];')
shell.write_text(text)
shutil.copyfile(Path(__file__).with_name('room-transport.js'),a.output/'room-transport.js')
html=a.output/'boxedwine.html'
html.write_text(html.read_text().replace('<script src=boxedwine-shell.js>', '<script src=room-transport.js></script><script src=boxedwine-shell.js>'))
shutil.copyfile(root,a.output/'runtime.zip')
with zipfile.ZipFile(root) as z:
    candidates=[n for n in z.namelist() if n.endswith('/dinput.dll')]
    print('Wine input modules:',candidates,flush=True)
    if not candidates: raise RuntimeError('Missing original Wine input implementation')
    chosen=next((n for n in candidates if '/i386-windows/' in n),candidates[0])
    real_input=z.read(chosen)
    print('Root home entries:',[n for n in z.namelist() if n.startswith('home/')][:15],flush=True)
startup = r'''@echo off
cd /d "%~dp0"
if not exist "C:\JoeyCommon" mkdir "C:\JoeyCommon"
reg add "HKLM\Software\KONAMI\Yu-Gi-Oh! Power Of Chaos" /v InstallDirJ /t REG_SZ /d "%CD%" /f
reg add "HKLM\Software\KONAMI\Yu-Gi-Oh! Power Of Chaos" /v CommonDir /t REG_SZ /d "C:\JoeyCommon" /f
reg add "HKCU\Software\Wine\Direct3D" /v renderer /t REG_SZ /d gdi /f
reg add "HKCU\Software\Wine\Direct3D" /v DirectDrawRenderer /t REG_SZ /d gdi /f
reg add "HKCU\Software\Wine\DirectInput" /v MouseWarpOverride /t REG_SZ /d disable /f
copy /y "%~dp0dinput.dll" "%WINDIR%\system32\dinput.dll"
copy /y "%~dp0joey-system-dinput.dll" "%WINDIR%\system32\joey-system-dinput.dll"
copy /y "%~dp0joey-online.ini" "%WINDIR%\system32\joey-online.ini"
echo JOEY_STARTING_ORIGINAL_GAME
joey_pc.exe
echo JOEY_GAME_EXITED_%ERRORLEVEL%
'''
with zipfile.ZipFile(game) as incoming,zipfile.ZipFile(a.output/'game.zip','w',compression=zipfile.ZIP_STORED) as outgoing:
    for entry in incoming.infolist():
        if entry.is_dir(): continue
        name=entry.filename.split('/',1)[1]
        if name=='dinput.dll': data=(a.native/'dinput.dll').read_bytes()
        elif name=='joey-online.ini': data='[Online]\r\nEnabled=1\r\nEndpoint=http://127.0.0.1:80\r\n'.encode('utf-16')
        else: data=incoming.read(entry)
        outgoing.writestr('joey/'+name,data)
    outgoing.writestr('joey/start-game.bat',startup.replace('\n','\r\n'))
    outgoing.write(a.native/'native-check.exe','joey/native-check.exe')
    outgoing.writestr('joey/joey-system-dinput.dll',real_input)
with zipfile.ZipFile(a.output/'online.zip','w',compression=zipfile.ZIP_DEFLATED) as outgoing:
    prefix='home/username/.wine/drive_c/windows/system32/'
    outgoing.writestr(prefix+'dinput.dll',(a.native/'dinput.dll').read_bytes())
    outgoing.writestr(prefix+'joey-system-dinput.dll',real_input)
    outgoing.writestr(prefix+'joey-online.ini','[Online]\r\nEnabled=1\r\nEndpoint=http://127.0.0.1:80\r\n'.encode('utf-16'))
print('Prepared browser game probe:',[f.name for f in a.output.iterdir()],flush=True)

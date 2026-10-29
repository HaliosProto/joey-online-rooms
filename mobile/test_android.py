"""Cloud Android emulator smoke test of the real signed WebView installer."""
import pathlib, subprocess, time, xml.etree.ElementTree as ET, re
out=pathlib.Path('android-test-results');out.mkdir(exist_ok=True)
def adb(*args):return subprocess.check_output(['adb',*args],timeout=45)
def tree():
    adb('shell','uiautomator','dump','/sdcard/joey.xml')
    data=adb('shell','cat','/sdcard/joey.xml');(out/'screen.xml').write_bytes(data)
    return ET.fromstring(data)
def find(label,timeout=240):
    until=time.monotonic()+timeout
    while time.monotonic()<until:
        for node in tree().iter('node'):
            if label in node.get('text','') or label in node.get('content-desc',''):return node
        print('Waiting for Android screen:',label,flush=True);time.sleep(8)
    raise RuntimeError('Android screen missing: '+label)
def tap(node):
    x1,y1,x2,y2=map(int,re.findall(r'\d+',node.get('bounds')));adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
try:
    adb('shell','am','start','-n','com.haliosproto.joeyonline/.MainActivity')
    find('Joey Online',90)
    tap(find('Download & prepare game',30));tap(find('Start game',300))
    find('Tap to click',720);time.sleep(35)
    (out/'android-game.png').write_bytes(adb('exec-out','screencap','-p'))
    (out/'result.txt').write_text('PASS: signed Android app downloaded and cached the game, started the original game, and activated its multiplayer hook in Android 15 WebView. This is a cloud emulator, not a physical phone or complete duel.\n')
finally:
    (out/'logcat.txt').write_bytes(adb('logcat','-d','-t','1000'))
    (out/'final.png').write_bytes(adb('exec-out','screencap','-p'))

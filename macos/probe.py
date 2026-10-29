"""Exercise the released Windows game and transport on cloud-hosted Macs."""
import hashlib
import os
from pathlib import Path
import subprocess
import time
import urllib.request
import zipfile

root = Path('probe').resolve()
root.mkdir(exist_ok=True)
def fetch(url, name, expected):
    path = root / name
    urllib.request.urlretrieve(url, path)
    if hashlib.file_digest(path.open('rb'), 'sha256').hexdigest() != expected:
        raise RuntimeError('Downloaded archive checksum mismatch: ' + name)
    return path
wine_archive = fetch('https://github.com/Gcenx/macOS_Wine_builds/releases/download/11.0_1/wine-stable-11.0_1-osx64.tar.xz', 'wine.tar.xz', 'b50dc50ec7f41d58b115a6b685d4d1315ba3c797bd3aa0f49213f2703cb82388')
subprocess.run(['/usr/bin/tar', '-xJf', str(wine_archive), '-C', str(root)], check=True)
wine = next(root.glob('*.app/Contents/Resources/wine/bin/wine'))
print('Wine binary:', wine, flush=True)
subprocess.run(['/usr/bin/file', str(wine)], check=True)
subprocess.run([str(wine), '--version'], check=True)
game_archive = fetch('https://github.com/HaliosProto/joey-online-rooms/releases/download/full-game-preview-2/Joey-the-Passion-Online-Full-Game.zip', 'game.zip', 'f41c3e7203f7f1246c19c14f0abbbf4a23d687d2ed19c6738d7c1081cb747267')
with zipfile.ZipFile(game_archive) as package:
    package.extractall(root / 'game')
game = next((root / 'game').glob('*/joey_pc.exe')).parent
env = dict(os.environ, WINEPREFIX=str(root / 'prefix'), WINEARCH='win64', WINEDLLOVERRIDES='dinput=n,b;mscoree,mshtml=', WINEDEBUG='-all')
with (root / 'transport.txt').open('w') as log:
    result = subprocess.run([str(wine), str(root / 'native-check.exe'), 'https://joey-online-rooms.joey-online-rooms.workers.dev'], env=env, stdout=log, stderr=subprocess.STDOUT, timeout=180)
print((root / 'transport.txt').read_text(errors='replace'), flush=True)
# Run only on the cloud VM; do not open a game on the user's workstation.
env['WINEDEBUG'] = '+debugstr,+loaddll'
with (root / 'game-start.txt').open('w') as log:
    process = subprocess.Popen([str(wine), 'joey_pc.exe'], cwd=game, env=env, stdout=log, stderr=subprocess.STDOUT)
    time.sleep(25)
    print('Game process after 25 seconds:', process.poll(), flush=True)
    subprocess.run([str(wine.parent / 'wineserver'), '-k'], env=env, check=False)
    process.wait(timeout=20)
print((root / 'game-start.txt').read_text(errors='replace')[-16000:], flush=True)
if result.returncode:
    raise SystemExit('Mac native transport failed: ' + str(result.returncode))

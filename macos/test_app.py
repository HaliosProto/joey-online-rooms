"""Exercise first-run setup, actual game launch and live native rooms on Macs."""
import os
from pathlib import Path
import subprocess
import sys
import time

app = Path(sys.argv[1]).resolve()
harness = Path(sys.argv[2]).resolve()
report = Path('mac-test-results').resolve()
report.mkdir(exist_ok=True)
support = report / 'User Support With Spaces'
env = dict(os.environ, JOEY_HOME=str(support), JOEY_WINE_DEBUG='+debugstr,+loaddll')
resources = app / 'Contents' / 'Resources'
engine = support / 'runtime-11.20' / 'Wine Devel.app' / 'Contents' / 'Resources' / 'wine' / 'bin'
wine_env = dict(env, WINEPREFIX=str(support / 'prefix'))
launcher = None
try:
    subprocess.run(['/bin/bash', str(resources / 'bootstrap.sh'), '--prepare-only'], env=env, check=True, timeout=240)
    print('CHECK: first-run preparation passed; starting actual Mac app', flush=True)
    marker = support / 'Common' / 'mac-save-preservation-check.txt'
    marker.write_text('keep this user save')
    launcher = subprocess.Popen([str(app / 'Contents' / 'MacOS' / 'JoeyLauncher')], env=env)
    time.sleep(30)
    if launcher.poll() is not None:
        raise RuntimeError('Mac launcher exited before the game startup check')
    subprocess.run(['/usr/sbin/screencapture', '-x', str(report / 'game-start.png')], check=False, timeout=15)
    processes = subprocess.check_output(['/bin/ps', '-axo', 'pid,command'], text=True)
    (report / 'processes.txt').write_text(processes)
    log = (support / 'launcher.log').read_text(errors='replace')
    if 'Joey Online: integrated cloud networking enabled' not in log:
        raise RuntimeError('Original game did not activate the multiplayer proxy')
    if not any('joey_pc.exe' in line.lower() and 'explorer' not in line.lower() for line in processes.splitlines()):
        raise RuntimeError('Original game process exited during startup')
    print('CHECK: original game launched and activated multiplayer proxy', flush=True)
    # Stop only this isolated test environment. No game runs on the user's PC.
    launcher.terminate()
    launcher.wait(timeout=20)
    launcher = None
    subprocess.run([str(engine / 'wineserver'), '-k'], env=wine_env, check=False, timeout=20)
    subprocess.run([str(engine / 'wineserver'), '-w'], env=wine_env, check=True, timeout=20)
    if marker.read_text() != 'keep this user save':
        raise RuntimeError('User data changed during game shutdown')
    print('CHECK: testing native live rooms with the prepared runtime', flush=True)
    subprocess.run(['/bin/bash', str(resources / 'bootstrap.sh'), '--transport-check', str(harness)], env=env, check=True, timeout=240)
    log = (support / 'launcher.log').read_text(errors='replace')
    if 'PASS: native hosting' not in log:
        raise RuntimeError('Live native room test did not pass')
    (report / 'result.txt').write_text('PASS: Mac launcher, save preservation, isolated environment, verified runtime download, original game startup/proxy activation and live native public-room/relay checks. Full duel unverified.\n')
finally:
    subprocess.run(['/usr/sbin/screencapture', '-x', str(report / 'final-screen.png')], check=False, timeout=15)
    if launcher is not None and launcher.poll() is None:
        launcher.terminate()
        launcher.wait(timeout=20)
    if (engine / 'wineserver').exists():
        subprocess.run([str(engine / 'wineserver'), '-k'], env=wine_env, check=False, timeout=20)
    log = support / 'launcher.log'
    if log.exists():
        (report / 'launcher.txt').write_bytes(log.read_bytes())
        print(log.read_text(errors='replace')[-14000:], flush=True)

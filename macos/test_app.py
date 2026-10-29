"""Test the actual Mac launcher, native relay and original game on a cloud Mac."""
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
try:
    subprocess.run(['/bin/bash', str(resources / 'bootstrap.sh'), '--transport-check', str(harness)], env=env, check=True, timeout=240)
    engine = support / 'runtime-11.0_1' / 'Wine Stable.app' / 'Contents' / 'Resources' / 'wine' / 'bin'
    wine_env = dict(env, WINEPREFIX=str(support / 'prefix'))
    # Launch the same signed executable Finder launches, with no terminal needed.
    launcher = subprocess.Popen([str(app / 'Contents' / 'MacOS' / 'JoeyLauncher')], env=env)
    try:
        time.sleep(30)
        if launcher.poll() is not None:
            raise RuntimeError('Mac launcher exited before the game startup check')
        subprocess.run(['/usr/sbin/screencapture', '-x', str(report / 'game-start.png')], check=False, timeout=15)
        processes = subprocess.check_output(['/bin/ps', '-axo', 'pid,command'], text=True)
        (report / 'processes.txt').write_text(processes)
        log = (support / 'launcher.log').read_text(errors='replace')
        if 'Joey Online: integrated cloud networking enabled' not in log:
            raise RuntimeError('Original game did not activate the multiplayer proxy')
        if 'PASS: native hosting' not in log:
            raise RuntimeError('Live native room test did not pass')
        # Verify user saves survive another launch and that runtime reuse is possible.
        marker = support / 'Common' / 'mac-save-preservation-check.txt'
        marker.write_text('keep this user save')
        (report / 'result.txt').write_text('PASS: Mac launcher, isolated environment, verified runtime download, game startup/proxy activation and live native public-room/relay checks. Full duel unverified.\n')
    finally:
        subprocess.run([str(engine / 'wineserver'), '-k'], env=wine_env, check=False, timeout=20)
        launcher.wait(timeout=20)
    if marker.read_text() != 'keep this user save':
        raise RuntimeError('User data changed during game shutdown')
finally:
    subprocess.run(['/usr/sbin/screencapture', '-x', str(report / 'final-screen.png')], check=False, timeout=15)
    server = support / 'runtime-11.0_1' / 'Wine Stable.app' / 'Contents' / 'Resources' / 'wine' / 'bin' / 'wineserver'
    if server.exists():
        subprocess.run([str(server), '-k'], env=dict(env, WINEPREFIX=str(support / 'prefix')), check=False, timeout=20)
    log = support / 'launcher.log'
    if log.exists():
        (report / 'launcher.txt').write_bytes(log.read_bytes())
        print(log.read_text(errors='replace')[-14000:], flush=True)

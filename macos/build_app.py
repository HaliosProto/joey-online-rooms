"""Build an Intel macOS .app; Apple Silicon runs it with Apple's Rosetta."""
import argparse
import hashlib
from pathlib import Path
import plistlib
import shutil
import subprocess
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--game-zip', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--module', type=Path, required=True)
args = parser.parse_args()
project = Path(__file__).resolve().parents[1]
if hashlib.file_digest(args.game_zip.open('rb'), 'sha256').hexdigest() != 'f41c3e7203f7f1246c19c14f0abbbf4a23d687d2ed19c6738d7c1081cb747267':
    raise SystemExit('Wrong game ZIP checksum')
app = args.output / 'Joey Online.app'
app.mkdir(parents=True, exist_ok=False)
contents = app / 'Contents'
resources = contents / 'Resources'
resources.mkdir(parents=True)
(contents / 'MacOS').mkdir()
with zipfile.ZipFile(args.game_zip) as archive:
    archive.extractall(args.output / 'extracted')
shutil.move(str(args.output / 'extracted' / 'Yu-Gi-Oh! Power of Chaos JOEY THE PASSION'), resources / 'Game')
(args.output / 'extracted').rmdir()
# Only the Mac companion changes; original game files retain their release hashes.
shutil.copyfile(args.module, resources / 'Game' / 'dinput.dll')
checksums = resources / 'Game' / 'SHA256SUMS.txt'
module_hash = hashlib.file_digest(args.module.open('rb'), 'sha256').hexdigest()
lines = checksums.read_text().splitlines()
checksums.write_text(''.join((module_hash + '  dinput.dll' if line.endswith('  dinput.dll') else line) + '\n' for line in lines))
for name in ['bootstrap.sh', 'README-MAC.txt']:
    shutil.copyfile(project / 'macos' / name, resources / name)
(resources / 'bootstrap.sh').chmod(0o755)
plist = {
    'CFBundleExecutable': 'JoeyLauncher', 'CFBundleIdentifier': 'com.haliosproto.joeyonline',
    'CFBundleName': 'Joey Online', 'CFBundleDisplayName': 'Joey Online',
    'CFBundlePackageType': 'APPL', 'CFBundleShortVersionString': '0.2.1',
    'CFBundleVersion': '3', 'LSMinimumSystemVersion': '10.15', 'NSHighResolutionCapable': True,
}
with (contents / 'Info.plist').open('wb') as output:
    plistlib.dump(plist, output)
subprocess.run(['clang', '-arch', 'x86_64', '-mmacosx-version-min=10.15', '-fobjc-arc', '-Wall', '-Wextra', '-Werror', '-framework', 'Cocoa', str(project / 'macos' / 'Launcher.m'), '-o', str(contents / 'MacOS' / 'JoeyLauncher')], check=True)
subprocess.run(['codesign', '--force', '--sign', '-', str(app)], check=True)
subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)], check=True)
shutil.copyfile(project / 'macos' / 'README-MAC.txt', args.output / 'README-MAC.txt')
print(app)

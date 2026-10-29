"""Build and verify a full game ZIP from the user's supplied game folder."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--game', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
project = Path(__file__).resolve().parents[1]
game = args.game.resolve(strict=True)
output = args.output.resolve()
output.parent.mkdir(parents=True, exist_ok=True)
if output.exists():
    raise SystemExit('Output already exists; choose a new bundle filename.')

names = ['data.dat', 'deck.ydc', 'dinput.dll', 'exporter.exe', 'joey_pc.exe',
         'joey-online.ini', 'ReadMe_Joey.html', 'Region.dat', 'Voice.dat']
sources = {name: game / name for name in names}
sources['COPYING.LIB'] = project / 'native' / 'COPYING.LIB'
sources['README-PLAY-ONLINE.txt'] = project / 'distribution' / 'README-PLAY-ONLINE.txt'
sources['MULTIPLAYER-NOTICE.txt'] = project / 'distribution' / 'MULTIPLAYER-NOTICE.txt'
for name, source in sources.items():
    if not source.is_file() or source.is_symlink():
        raise SystemExit(f'Missing or unsupported bundle source: {name}')

known_executable = 'c5749eb934a1cf68d9236e44ff81e98b8aaee486b4f8ebd417440505d44ac1ea'
installation = json.loads((game / 'joey-online-installation.json').read_text(encoding='utf-8'))
configuration = (game / 'joey-online.ini').read_bytes()
if hashlib.sha256(configuration).hexdigest() != installation['configSha256']:
    raise SystemExit('The installed multiplayer configuration changed; review it before sharing.')
prefix = 'Yu-Gi-Oh! Power of Chaos JOEY THE PASSION/'
files = []
try:
    with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=1, allowZip64=True) as archive:
        for name, source in sources.items():
            digest = hashlib.sha256()
            size = 0
            with source.open('rb') as incoming, archive.open(prefix + name, 'w', force_zip64=True) as outgoing:
                while chunk := incoming.read(1024 * 1024):
                    outgoing.write(chunk)
                    digest.update(chunk)
                    size += len(chunk)
            checksum = digest.hexdigest()
            if name == 'joey_pc.exe' and checksum != known_executable:
                raise ValueError('The game executable differs from the qualified copy.')
            if name == 'dinput.dll' and checksum != installation['moduleSha256']:
                raise ValueError('The multiplayer module differs from the installed cloud-built copy.')
            files.append({'name': name, 'bytes': size, 'sha256': checksum})
        checksums = ''.join(f"{entry['sha256']}  {entry['name']}\n" for entry in files)
        archive.writestr(prefix + 'SHA256SUMS.txt', checksums)

    with zipfile.ZipFile(output) as archive:
        expected = {prefix + entry['name'] for entry in files} | {prefix + 'SHA256SUMS.txt'}
        if set(archive.namelist()) != expected:
            raise ValueError('Unexpected files in the game bundle.')
        for entry in files:
            digest = hashlib.sha256()
            with archive.open(prefix + entry['name']) as incoming:
                while chunk := incoming.read(1024 * 1024):
                    digest.update(chunk)
            if digest.hexdigest() != entry['sha256']:
                raise ValueError(f"Bundle verification failed: {entry['name']}")

    digest = hashlib.sha256()
    with output.open('rb') as incoming:
        while chunk := incoming.read(1024 * 1024):
            digest.update(chunk)
    checksum = digest.hexdigest()
    output.with_suffix('.sha256').write_text(f'{checksum}  {output.name}\n', encoding='ascii')
    report = {'archive': output.name, 'bytes': output.stat().st_size, 'sha256': checksum,
              'verified_files': len(files), 'files': files,
              'excluded': ['joey-online-installation.json (machine-specific maintenance record)']}
    output.with_suffix('.manifest.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({key: report[key] for key in ['archive', 'bytes', 'sha256', 'verified_files']}))
except BaseException:
    # Preserve a failed archive for inspection rather than presenting it as complete.
    raise

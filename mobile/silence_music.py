"""Silence only original music PCM; preserve WAV timing, voices and effects.

Container layout: https://yugiohextractor.sourceforge.net/documentation.htm
"""
import hashlib
import json
import shutil
import struct
import tempfile
import zipfile
from pathlib import Path

MUSIC = frozenset(('_dummy m_blue m_duel1 m_duel2 m_duel3 m_furi m_get '
    'm_jyank m_kaban m_lose m_menu m_red m_sum m_summon m_title m_tuto '
    'm_tutome m_ulti m_win m_yuri').split())


def silence_voice_archive(original):
    if original[:8] != b'KCEJYUGI':
        raise ValueError('Unexpected sound archive')
    count, = struct.unpack_from('<I', original, 8)
    output = bytearray(original)
    tracks, retained = [], []
    for index in range(count):
        at = 12 + index * 268
        name = bytes((x >> 4) | ((x & 15) << 4) for x in original[at:at+256]).split(b'\0')[0].decode('ascii')
        offset, size, packed = struct.unpack_from('<III', original, at+256)
        if offset < 12 + count*268 or offset+packed > len(original):
            raise ValueError('Invalid sound entry: '+name)
        stem = name.replace('\\','/').rsplit('/',1)[-1].removesuffix('.wav').lower()
        if '/stream/' not in name.replace('\\','/').lower() or stem not in MUSIC:
            retained.append((name, offset, packed, hashlib.sha256(original[offset:offset+packed]).hexdigest()))
            continue
        wav = original[offset:offset+size]
        if size != packed or wav[:4] != b'RIFF' or wav[8:12] != b'WAVE':
            raise ValueError('Unexpected music encoding: '+name)
        position, bits, frames = 12, None, 0
        while position+8 <= len(wav):
            kind, length = struct.unpack_from('<4sI', wav, position)
            start, end = position+8, position+8+length
            if end > len(wav):
                raise ValueError('Invalid WAV chunk: '+name)
            if kind == b'fmt ':
                encoding, channels, rate, _, alignment, bits = struct.unpack_from('<HHIIHH', wav, start)
                if encoding != 1 or bits not in (8,16,24,32):
                    raise ValueError('Music is not supported PCM: '+name)
            if kind == b'data':
                if bits is None:
                    raise ValueError('Music data precedes format')
                output[offset+start:offset+end] = bytes([128 if bits == 8 else 0])*length
                frames += length//alignment
            position = end+(length & 1)
        if not frames:
            raise ValueError('Empty music WAV: '+name)
        tracks.append({'name':name,'seconds':frames/rate,'pcm_silent':True})
    if {Path(t['name'].replace('\\','/')).stem.lower() for t in tracks} != MUSIC:
        raise ValueError('Original music inventory changed')
    # Compare every voice/effect byte, including its original archive index.
    assert output[:12+count*268] == original[:12+count*268]
    for name,offset,size,digest in retained:
        assert hashlib.sha256(output[offset:offset+size]).hexdigest() == digest, name
    return bytes(output), {'music_tracks':tracks,'unchanged_voice_effect_entries':len(retained),'archive_bytes':len(output)}


def silence_site_game(site, virtual):
    old = virtual['game.zip']
    with tempfile.TemporaryDirectory(prefix='joey-music-',dir=site.parent) as temporary:
        folder = Path(temporary)
        incoming, outgoing = folder/'before.zip', folder/'after.zip'
        with incoming.open('wb') as target:
            for part in old['parts']:
                with (site/part).open('rb') as source: shutil.copyfileobj(source,target)
        with zipfile.ZipFile(incoming) as source, zipfile.ZipFile(outgoing,'w') as target:
            names = [i.filename for i in source.infolist() if i.filename.lower().endswith('/voice.dat')]
            if len(names) != 1: raise ValueError('Missing original sound archive')
            for entry in source.infolist():
                if entry.filename == names[0]:
                    data, report = silence_voice_archive(source.read(entry))
                    target.writestr(entry,data)
                else:
                    with source.open(entry) as reader,target.open(entry,'w') as writer:
                        shutil.copyfileobj(reader,writer)
        with zipfile.ZipFile(incoming) as before,zipfile.ZipFile(outgoing) as after:
            for entry in before.infolist():
                if entry.filename == names[0]: continue
                with before.open(entry) as a,after.open(entry) as b:
                    assert hashlib.file_digest(a,'sha256').digest() == hashlib.file_digest(b,'sha256').digest(),entry.filename
        with outgoing.open('rb') as source: digest=hashlib.file_digest(source,'sha256').hexdigest()
        parts=[]
        with outgoing.open('rb') as source:
            while data:=source.read(16*1024*1024):
                name=f'game-silent-{digest[:12]}.part{len(parts):03d}'
                (site/name).write_bytes(data);parts.append(name)
        for name in old['parts']:
            if name not in parts: (site/name).unlink()
        virtual['game.zip']={'parts':parts,'bytes':outgoing.stat().st_size}
        (site/'music-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        print('Silenced music:',len(report['music_tracks']),'Preserved voice/effect entries:',report['unchanged_voice_effect_entries'])

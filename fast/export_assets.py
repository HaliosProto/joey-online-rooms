"""Convert authorized game resources into small browser-native assets in cloud builds.

Archive layout/LZSS and card-property documentation:
bitemydusto/YGO-PoC-Toolset @ 76a9eab2dcfa3f215af9b52a162ae576961304ba (MIT).
No game executable, emulator, registry or personal save file is executed/read.
"""
from pathlib import Path, PurePosixPath
import argparse, struct, json, hashlib, sqlite3, re

class Archive:
    def __init__(self,path):
        self.stream=Path(path).open('rb');self.entries={}
        if self.stream.read(8)!=b'KCEJYUGI':raise ValueError('Invalid archive')
        count=struct.unpack('<I',self.stream.read(4))[0]
        if count>20000:raise ValueError('Excessive entry count')
        size=Path(path).stat().st_size
        for _ in range(count):
            raw=self.stream.read(256)
            name=bytes((b>>4)|((b&15)<<4) for b in raw).split(b'\0')[0].decode('ascii').replace('\\','/')
            off,unpacked,packed=struct.unpack('<III',self.stream.read(12))
            if off+packed>size or unpacked>32*1024*1024:raise ValueError('Invalid resource range')
            if PurePosixPath(name).is_absolute() or '..' in PurePosixPath(name).parts:raise ValueError('Unsafe path')
            self.entries[name.casefold()]=(off,unpacked,packed)
    def read(self,name):
        off,size,packed=self.entries[name.casefold()];self.stream.seek(off);raw=self.stream.read(packed)
        if packed!=size:
            out=bytearray();dictionary=bytearray(4096);pos=0xfee;i=0;flags=0
            while len(out)<size:
                flags>>=1
                if not flags&0x100:flags=0xff00|raw[i];i+=1
                if flags&1:chunk=raw[i:i+1];i+=1
                else:
                    a,b=raw[i:i+2];i+=2;start=a|((b&0xf0)<<4);chunk=None
                    for k in range((b&15)+3):
                        value=dictionary[(start+k)&4095];out.append(value);dictionary[pos]=value;pos=(pos+1)&4095
                        if len(out)==size:break
                if chunk:
                    value=chunk[0];out.append(value);dictionary[pos]=value;pos=(pos+1)&4095
            raw=bytes(out)
        if raw.startswith(b'YPK1'):raw=bytes(((b>>4)|((b&15)<<4))^0xcc for b in raw[4:])
        return raw

def export(game,output,scripts,db):
    from PIL import Image
    import io
    output.mkdir(parents=True,exist_ok=True);images=output/'cards';images.mkdir(exist_ok=True)
    arc=Archive(game/'data.dat')
    ids=arc.read('bin#/card_id.bin');names=arc.read('bin#/card_nameeng.bin');desc=arc.read('bin#/card_desceng.bin');indices=arc.read('bin#/card_indxeng.bin');props=arc.read('bin#/card_prop.bin');passes=arc.read('bin#/card_pass.bin');packs=arc.read('bin#/card_pack.bin')
    image_names=[line.strip() for line in arc.read('card/list_card.txt').decode('utf-8-sig').splitlines() if line.strip() and not line.startswith('//')]
    catalog=[];by_original={}
    for i,image in enumerate(image_names):
        if i*2+2>len(ids):break
        original=struct.unpack_from('<H',ids,i*2)[0];passcode=passes[i*4:i*4+4].hex();code=int(passcode) if passcode.isdecimal() else 0;prop=struct.unpack_from('<I',props,i*4)[0];pack=struct.unpack_from('<H',packs,i*2)[0]
        name=names[i*64:(i+1)*64].split(b'\0')[0].decode('utf-8');start=struct.unpack_from('<I',indices,i*4)[0];text=desc[start:].split(b'\0')[0].decode('utf-8')
        if not name or not code or not pack&4:continue
        path='card/'+image.replace('\\','/').split('/')[-1]
        if path.casefold() not in arc.entries:raise ValueError('Missing card art: '+path)
        bitmap=Image.open(io.BytesIO(arc.read(path)));bitmap.convert('RGB').save(images/f'{code}.webp','WEBP',quality=86,method=4)
        kind=(prop>>20)&31;sub=(prop>>18)&3
        card={'id':code,'originalId':original,'name':name,'text':text,'image':f'cards/{code}.webp','level':(prop>>25)&15,'attack':((prop>>9)&511)*10,'defense':(prop&511)*10,'kind':('spell' if kind==22 else 'trap' if kind==21 else 'fusion' if sub==2 else 'ritual' if sub==3 else 'monster')}
        by_original[original]=card;catalog.append(card)
    bitmap=Image.open(io.BytesIO(arc.read('card/card_ura.bmp')));bitmap.convert('RGB').save(images/'back.webp','WEBP',quality=86)
    for size in [192,512]:
        icon=Image.new('RGB',(size,size),(16,29,36));art=bitmap.convert('RGB');art.thumbnail((int(size*.7),int(size*.9)));icon.paste(art,((size-art.width)//2,(size-art.height)//2));icon.save(output/f'icon-{size}.png')
    deck=(game/'deck.ydc').read_bytes();count=struct.unpack_from('<H',deck,8)[0]
    if count<40 or count>60 or len(deck)<10+count*2:raise ValueError('Invalid supplied deck')
    main=[by_original[struct.unpack_from('<H',deck,10+i*2)[0]]['id'] for i in range(count)]
    extra=[];at=10+count*2
    if len(deck)>=at+2:
        n=struct.unpack_from('<H',deck,at)[0]
        if len(deck)<at+2+n*2:raise ValueError('Truncated fusion deck')
        extra=[by_original[struct.unpack_from('<H',deck,at+2+i*2)[0]]['id'] for i in range(n)]
    connection=sqlite3.connect(db);connection.row_factory=sqlite3.Row
    cards={};texts={}
    for r in connection.execute('SELECT * FROM datas'):
        setcode=r['setcode']&((1<<64)-1);level=r['level'];kind=r['type']
        cards[str(r['id'])]={'code':r['id'],'alias':r['alias'],'setcodes':[(setcode>>(i*16))&65535 for i in range(4) if (setcode>>(i*16))&65535], 'type':kind,'level':level&255,'attribute':r['attribute'],'race':str(r['race']),'attack':r['atk'],'defense':r['def'],'lscale':(level>>24)&255,'rscale':(level>>16)&255,'link_marker':0}
    for r in connection.execute('SELECT * FROM texts'):texts[str(r['id'])]={'name':r['name'],'text':r['desc'],'strings':[r[f'str{i}'] for i in range(1,17)]}
    for card in catalog:
        text=texts.get(str(card['id']),{})
        card['originalText']=card['text'];card['text']=text.get('text',card['text']);card['strings']=text.get('strings',[])
    missing=[c['name'] for c in catalog if str(c['id']) not in cards]
    if missing:raise ValueError('Engine lacks original cards: '+str(missing))
    files={p.name:p.read_text(encoding='utf-8-sig') for p in scripts.glob('*.lua')}
    # Include all scripts for this era, plus explicit dependencies and token scripts.
    wanted={f"c{c['id']}.lua" for c in catalog}
    official={p.name:p for p in (scripts/'official').glob('*.lua')}
    queue=list(wanted)
    while queue:
        name=queue.pop()
        if name in files or name not in official:continue
        text=official[name].read_text(encoding='utf-8-sig');files[name]=text
        for dependency in re.findall(r'c\d+\.lua',text)+[f'c{x}.lua' for x in re.findall(r'LoadCardScript\(\s*(\d+)',text)]:
            if dependency not in files:queue.append(dependency)
    for name,data in [('catalog.json',{'cards':catalog,'starter':{'main':main,'extra':extra}}),('rules.json',{'cards':cards,'texts':texts,'scripts':files})]:
        (output/name).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(json.dumps({'cards':len(catalog),'scripts':len(files),'rulesBytes':(output/'rules.json').stat().st_size,'artBytes':sum(p.stat().st_size for p in images.iterdir()),'starterCards':len(main)},indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--game',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--scripts',type=Path,required=True);p.add_argument('--database',type=Path,required=True);a=p.parse_args();export(a.game,a.output,a.scripts,a.database)

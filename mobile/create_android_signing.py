"""Create a durable Android signing identity and save an encrypted Windows backup.
Run once on the account owner's Windows PC. No game or build runs locally.
"""
import base64, ctypes, datetime, json, secrets, shutil, subprocess
from pathlib import Path
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID
backup=Path(__file__).resolve().parents[1]/'bundles/android-signing-key.dpapi'
if backup.exists():raise SystemExit('An encrypted signing backup already exists; refusing to replace the app identity.')
gh=shutil.which('gh') or r'C:\Program Files\GitHub CLI\gh.exe'
existing=json.loads(subprocess.check_output([gh,'secret','list','--repo','HaliosProto/joey-online-rooms','--json','name']))
if any(s['name'].startswith('JOEY_ANDROID_KEYSTORE_') for s in existing):raise SystemExit('Signing secrets already exist; refusing to replace them.')
password=secrets.token_urlsafe(32)
key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
name=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'Joey Online Community Build')])
now=datetime.datetime.now(datetime.timezone.utc)
certificate=x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key()).serial_number(x509.random_serial_number()).not_valid_before(now-datetime.timedelta(days=1)).not_valid_after(now+datetime.timedelta(days=365*25)).add_extension(x509.BasicConstraints(ca=False,path_length=None),critical=True).sign(key,hashes.SHA256())
data=pkcs12.serialize_key_and_certificates(b'joey-online',key,certificate,None,serialization.BestAvailableEncryption(password.encode()))
payload=json.dumps({'keystore_base64':base64.b64encode(data).decode(),'password':password}).encode()
class Blob(ctypes.Structure):_fields_=[('length',ctypes.c_ulong),('data',ctypes.POINTER(ctypes.c_ubyte))]
buffer=(ctypes.c_ubyte*len(payload)).from_buffer_copy(payload);incoming=Blob(len(payload),buffer);outgoing=Blob()
if not ctypes.windll.crypt32.CryptProtectData(ctypes.byref(incoming),'Joey Android signing backup',None,None,None,1,ctypes.byref(outgoing)):raise ctypes.WinError()
try:backup.write_bytes(ctypes.string_at(outgoing.data,outgoing.length))
finally:ctypes.windll.kernel32.LocalFree(outgoing.data)
for secret,value in [('JOEY_ANDROID_KEYSTORE_BASE64',base64.b64encode(data).decode()),('JOEY_ANDROID_KEYSTORE_PASSWORD',password)]:
    result=subprocess.run([gh,'secret','set',secret,'--repo','HaliosProto/joey-online-rooms'],input=value,text=True,capture_output=True)
    if result.returncode:raise SystemExit('Could not store signing secret '+secret+'; encrypted backup retained.')
print('Android signing identity stored in encrypted GitHub secrets. Encrypted local backup:',backup)
print('Signing certificate SHA256:',certificate.fingerprint(hashes.SHA256()).hex())

import {Reader,Writer,hex,unhex,OP} from '../cloud/src/protocol.mjs';
export const APP='4a4f4559464153540000000000000001';
export const ENDPOINT='https://joey-online-rooms.joey-online-rooms.workers.dev';
const enc=new TextEncoder(),dec=new TextDecoder();
export const json=value=>JSON.stringify(value,(_key,v)=>typeof v==='bigint'?String(v):v);
export class Rooms{
 constructor({endpoint=ENDPOINT,onEvent=()=>{}}={}){this.endpoint=endpoint;this.onEvent=onEvent;this.socket=null;this.heartbeat=null;}
 async list(){
  const response=await fetch(this.endpoint+'/v1/rooms?app='+APP,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Rooms are temporarily unavailable.');
  const reader=new Reader(await response.arrayBuffer()),n=reader.u32(),rooms=[];if(n>100)throw Error('Invalid room list.');
  for(let i=0;i<n;i++){const room={id:hex(reader.take(16)),app:hex(reader.take(16)),flags:reader.u32(),maximum:reader.u32(),players:reader.u32(),name:reader.text(64),reserved:reader.blob()};if(room.app!==APP||room.maximum!==2)throw Error('Invalid room.');rooms.push(room);}
  reader.end();return rooms;
 }
 async create(name,player){
  const body=new Writer().raw(enc.encode('JYR1')).raw(unhex(APP)).u32(0).text(name.trim()).blob(enc.encode('{"client":"joey-fast","protocol":1}')).finish();
  const response=await fetch(this.endpoint+'/v1/rooms',{method:'POST',body,signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error(response.status===429?'Too many rooms were created. Please wait a minute.':'Could not create a room. Please try again.');
  const reader=new Reader(await response.arrayBuffer()),id=hex(reader.take(16)),token=hex(reader.take(32));reader.end();await this.connect(id,player,token);return id;
 }
 async connect(id,name,token){
  this.close();const url=new URL(`/v1/rooms/${id}/play`,this.endpoint);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.searchParams.set('role',token?'host':'guest');url.searchParams.set('name',name);
  const socket=this.socket=new WebSocket(url,token?['joey-online-v1','joey-auth.'+token]:['joey-online-v1']);socket.binaryType='arraybuffer';
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{socket.close();reject(Error('Connecting took too long.'));},10000);let welcomed=false;
   socket.onmessage=event=>{
    try{
     if(!(event.data instanceof ArrayBuffer)||event.data.byteLength>65545)throw Error('Invalid game data.');
     const reader=new Reader(event.data),op=reader.u8();
     if(op===OP.WELCOME){const local=reader.u32(),host=reader.u32(),n=reader.u8(),players=[];for(let i=0;i<n;i++)players.push({id:reader.u32(),name:reader.text(64)});reader.end();this.local=local;this.onEvent({kind:'welcome',local,host,players});welcomed=true;clearTimeout(timer);resolve();}
     else if(op===OP.JOINED){const id=reader.u32(),name=reader.text(64);reader.end();this.onEvent({kind:'joined',id,name});}
     else if(op===OP.DATA){const sender=reader.u32(),payload=JSON.parse(dec.decode(reader.take(reader.bytes.length-reader.offset)));this.onEvent({kind:'data',sender,payload});}
     else if(op===OP.LEFT){const id=reader.u32();reader.end();this.onEvent({kind:'left',id});}
     else if(op!==OP.PONG)throw Error('Unknown game message.');
    }catch(error){socket.close(1008,'Invalid game data');this.onEvent({kind:'error',message:error.message});}
   };
   socket.onerror=()=>{clearTimeout(timer);if(!welcomed)reject(Error('Could not connect to the room.'));};
   socket.onclose=()=>{clearTimeout(timer);clearInterval(this.heartbeat);if(!welcomed)reject(Error('This room is no longer available.'));this.onEvent({kind:'closed'});};
  });
  this.heartbeat=setInterval(()=>{if(socket.readyState===WebSocket.OPEN)socket.send(Uint8Array.of(OP.HEARTBEAT));},20000);
 }
 send(payload){const data=enc.encode(json(payload));if(data.length>65536)throw Error('Game update is too large.');if(this.socket?.readyState!==WebSocket.OPEN)throw Error('The room is disconnected.');this.socket.send(new Writer().u8(OP.SEND).u32(this.local===1?2:1).raw(data).finish());}
 close(){clearInterval(this.heartbeat);if(this.socket){const s=this.socket;this.socket=null;s.onclose=null;s.close();}}
}

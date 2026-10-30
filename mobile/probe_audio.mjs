// Test-only meter observes the output after SDL fills its audio buffer.
export function probeAudio(){
 const proto=(globalThis.AudioContext||globalThis.webkitAudioContext)?.prototype;
 if(!proto)return;
 const create=proto.createScriptProcessor;
 proto.createScriptProcessor=function(...args){
  const node=create.apply(this,args);let handler;
  window.joeyAudio={blocks:0,peak:0,nonzeroBlocks:0,latePeak:0,started:performance.now()};
  Object.defineProperty(node,'onaudioprocess',{configurable:true,get:()=>handler,set:fn=>{handler=fn;}});
  node.addEventListener('audioprocess',event=>{
   handler?.call(node,event);
   const result=window.joeyAudio;let peak=0;
   for(let c=0;c<event.outputBuffer.numberOfChannels;c++){
    for(const value of event.outputBuffer.getChannelData(c))peak=Math.max(peak,Math.abs(value));
   }
   result.blocks++;result.peak=Math.max(result.peak,peak);if(peak>0.00001)result.nonzeroBlocks++;
   if(performance.now()-result.started>1500)result.latePeak=Math.max(result.latePeak,peak);
  });
  return node;
 };
}

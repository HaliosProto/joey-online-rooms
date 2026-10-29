"""Small, reviewable integration patch against the pinned Boxedwine sources."""
from pathlib import Path
import sys
root=Path(sys.argv[1])/'project'/'emscripten'
p=root/'boxedwine-net.js'
s=p.read_text()
old='''      if (config["transport"]) {'''
new='''      if (config["createTransport"]) {
        if (!config["transport"]) config["transport"] = config["createTransport"]({
          allocateSocket: function (d, t, p) { return BoxedWineNetwork.allocateSocket(d, t, p); },
          setEvents: function (id, flags, bytes) { BoxedWineNetwork.setEvents(id, flags, bytes); },
          heap: function () { return HEAPU8; }
        });
      }
      if (config["transport"]) {'''
if s.count(old)!=1: raise RuntimeError('Unexpected network source revision')
p.write_text(s.replace(old,new))
p=root/'boxedwine-shell.js'
s=p.read_text()
old='Config.networking = getNetworkingConfig();'
new='Config.networking = {enabled:true, createTransport:function(api) {return globalThis.createJoeyRoomTransport(api, Module["joeyCloudOrigin"] || "https://joey-online-rooms.joey-online-rooms.workers.dev");}};'
if s.count(old)!=1: raise RuntimeError('Unexpected browser shell revision')
p.write_text(s.replace(old,new))


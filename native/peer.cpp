#include "peer.hpp"
#include <chrono>
#include <algorithm>

namespace joey {
using namespace std::chrono_literals;
static void joinThread(std::thread& thread) {
    if (!thread.joinable()) return;
    if (thread.get_id() == std::this_thread::get_id()) thread.detach(); else thread.join();
}
static void failure(const std::exception& error) { OutputDebugStringA((std::string("Joey Online: ") + error.what() + "\n").c_str()); }
HRESULT PeerState::notify(DWORD message, void* value) {
    std::lock_guard<std::recursive_mutex> guard(callbackMutex);
    if (!closed.load() && callback) return callback(callbackContext, message, value);
    return S_OK;
}
DPN_APPLICATION_DESC Room::descriptor() const {
    DPN_APPLICATION_DESC result{}; result.dwSize = sizeof(result); result.dwFlags = flags;
    result.guidInstance = id; result.guidApplication = app; result.dwMaxPlayers = maximum; result.dwCurrentPlayers = count;
    result.pwszSessionName = const_cast<wchar_t*>(name.c_str()); result.pvApplicationReservedData = reserved.empty() ? nullptr : const_cast<unsigned char*>(reserved.data());
    result.dwApplicationReservedDataSize = static_cast<DWORD>(reserved.size()); return result;
}
static std::vector<Room> rooms(const std::wstring& endpoint, const GUID& app) {
    const Bytes bytes = http(endpoint, L"GET", L"/v1/rooms?app=" + hex(&app, 16)); Reader reader(bytes);
    const DWORD count = reader.u32(); if (count > 100) throw std::runtime_error("Too many rooms in server response");
    std::vector<Room> result;
    for (DWORD i = 0; i < count; ++i) {
        Room room; room.id = reader.guid(); room.app = reader.guid(); room.flags = reader.u32(); room.maximum = reader.u32(); room.count = reader.u32(); room.name = reader.text(64); room.reserved = reader.blob();
        if (room.maximum != 2 || room.count > 2 || room.app != app) throw std::runtime_error("Invalid room description");
        result.push_back(std::move(room));
    }
    reader.end(); return result;
}
static void foundRooms(const std::shared_ptr<PeerState>& state, const GUID& app, void* context, const std::shared_ptr<std::atomic<bool>>& cancelled = {}) {
    for (const auto& room : rooms(state->endpoint, app)) {
        if (state->closed.load() || (cancelled && cancelled->load())) return;
        auto* sender = new Address(); sender->room = room.id;
        auto* device = new Address();
        auto description = room.descriptor();
        DPNMSG_ENUM_HOSTS_RESPONSE response{}; response.dwSize = sizeof(response); response.pAddressSender = sender; response.pAddressDevice = device;
        response.pApplicationDescription = &description; response.pvUserContext = context;
        state->notify(DPN_MSGID_ENUM_HOSTS_RESPONSE, &response);
        sender->Release(); device->Release();
    }
}
static void createPlayer(const std::shared_ptr<PeerState>& state, DPNID id) {
    DPNMSG_CREATE_PLAYER message{}; message.dwSize = sizeof(message); message.dpnidPlayer = id;
    { std::lock_guard<std::mutex> lock(state->mutex); message.pvPlayerContext = state->players.at(id).context; }
    state->notify(DPN_MSGID_CREATE_PLAYER, &message);
    { std::lock_guard<std::mutex> lock(state->mutex); auto found = state->players.find(id); if (found != state->players.end()) found->second.context = message.pvPlayerContext; }
}
static void receiveData(const std::shared_ptr<PeerState>& state, DPNID sender, Bytes bytes) {
    auto payload = std::make_shared<Bytes>(std::move(bytes));
    DPNMSG_RECEIVE message{}; message.dwSize = sizeof(message); message.dpnidSender = sender;
    message.pReceiveData = payload->data(); message.dwReceiveDataSize = static_cast<DWORD>(payload->size()); message.dwReceiveFlags = DPNSEND_GUARANTEED;
    { std::lock_guard<std::mutex> lock(state->mutex);
      auto player = state->players.find(sender); if (player == state->players.end()) throw std::runtime_error("Unknown relay sender");
      message.pvPlayerContext = player->second.context; message.hBufferHandle = state->nextBuffer++; state->receiveBuffers[message.hBufferHandle] = payload;
    }
    if (state->notify(DPN_MSGID_RECEIVE, &message) != DPNERR_PENDING) {
        std::lock_guard<std::mutex> lock(state->mutex); state->receiveBuffers.erase(message.hBufferHandle);
    }
}
static void frame(const std::shared_ptr<PeerState>& state, const Bytes& bytes, bool host) {
    Reader reader(bytes); const auto op = reader.u8();
    if (op == 128) {
        const auto local = reader.u32(), hostId = reader.u32(); const auto count = reader.u8();
        if (local != (host ? 1u : 2u) || hostId != 1 || count < 1 || count > 2) throw std::runtime_error("Invalid cloud welcome");
        std::map<DPNID, Player> players;
        for (unsigned int i = 0; i < count; ++i) {
            const auto id = reader.u32(); auto name = reader.text(64);
            if (id < 1 || id > 2 || players.count(id)) throw std::runtime_error("Invalid cloud player");
            players.emplace(id, Player{ name, id == local ? state->playerData : Bytes{}, (id == local ? DPNPLAYER_LOCAL : 0u) | (id == hostId ? DPNPLAYER_HOST : 0u), id == local ? state->localContext : nullptr });
        }
        reader.end(); if (!players.count(local) || !players.count(hostId)) throw std::runtime_error("Missing cloud player");
        { std::lock_guard<std::mutex> lock(state->mutex); state->localId = local; state->players = players; state->room.count = count; state->connected.store(true); }
        for (const auto& player : players) createPlayer(state, player.first);
        if (!host) {
            DPNMSG_CONNECT_COMPLETE complete{}; complete.dwSize = sizeof(complete); complete.hAsyncOp = state->connectHandle; complete.pvUserContext = state->connectContext; complete.hResultCode = S_OK; complete.dpnidLocal = local;
            state->notify(DPN_MSGID_CONNECT_COMPLETE, &complete);
        }
        { std::lock_guard<std::mutex> lock(state->mutex); state->connectionResult = S_OK; }
        state->changed.notify_all();
    } else if (op == 129) {
        const DPNID id = reader.u32(); const auto name = reader.text(64); reader.end();
        if (id < 1 || id > 2) throw std::runtime_error("Invalid joining player");
        { std::lock_guard<std::mutex> lock(state->mutex); if (state->players.count(id)) throw std::runtime_error("Duplicate joining player"); state->players[id] = Player{name, {}, id == 1 ? DPNPLAYER_HOST : 0u, nullptr}; state->room.count = static_cast<DWORD>(state->players.size()); }
        createPlayer(state, id);
    } else if (op == 130) {
        const DPNID sender = reader.u32(); receiveData(state, sender, reader.rest());
    } else if (op == 131) {
        DPNMSG_DESTROY_PLAYER message{}; message.dwSize = sizeof(message); message.dpnidPlayer = reader.u32(); message.dwReason = DPNDESTROYPLAYERREASON_NORMAL; reader.end();
        { std::lock_guard<std::mutex> lock(state->mutex); auto found = state->players.find(message.dpnidPlayer); if (found != state->players.end()) message.pvPlayerContext = found->second.context; }
        state->notify(DPN_MSGID_DESTROY_PLAYER, &message);
        { std::lock_guard<std::mutex> lock(state->mutex); state->players.erase(message.dpnidPlayer); }
    } else if (op == 132) { reader.end(); }
    else throw std::runtime_error("Unsupported cloud message");
}
Peer::~Peer() { Close(0); }
HRESULT Peer::QueryInterface(REFIID iid, void** output) {
    if (!output) return E_POINTER; *output = nullptr;
    if (iid != IID_IUnknown && iid != IID_IDirectPlay8Peer) return E_NOINTERFACE;
    *output = static_cast<IDirectPlay8Peer*>(this); AddRef(); return S_OK;
}
HRESULT Peer::Initialize(void* context, PFNDPNMESSAGEHANDLER callback, DWORD) {
    if (!callback) return E_INVALIDARG;
    std::lock_guard<std::recursive_mutex> lock(state->callbackMutex);
    if (state->callback) return DPNERR_ALREADYINITIALIZED;
    state->callback = callback; state->callbackContext = context; state->closed.store(false); return S_OK;
}
HRESULT Peer::EnumServiceProviders(const GUID* provider, const GUID*, DPN_SERVICE_PROVIDER_INFO* output, DWORD* size, DWORD* count, DWORD) {
    if (!size || !count) return E_POINTER;
    const std::wstring name = provider ? L"Cloud lobby" : L"Online rooms";
    const DWORD needed = sizeof(DPN_SERVICE_PROVIDER_INFO) + static_cast<DWORD>((name.size() + 1) * 2);
    const DWORD available = *size; *size = needed; *count = 1;
    if (!output || available < needed) return DPNERR_BUFFERTOOSMALL;
    std::memset(output, 0, needed); output->guid = provider ? GUID{} : CLSID_DP8SP_TCPIP; output->pwszName = reinterpret_cast<wchar_t*>(output + 1);
    std::memcpy(output->pwszName, name.c_str(), (name.size() + 1) * 2); return S_OK;
}
void Peer::stopEnumeration() {
    if (enumCancel) enumCancel->store(true);
    state->changed.notify_all();
    // Cancel must not wait for an application callback that may need a lock held by its caller.
    // The worker owns shared state and suppresses results once its own cancellation token is set.
    if (enumerator.joinable()) enumerator.detach();
}
HRESULT Peer::CancelAsyncOperation(DPNHANDLE, DWORD) {
    stopEnumeration(); return S_OK;
}
HRESULT Peer::EnumHosts(DPN_APPLICATION_DESC* description, IDirectPlay8Address*, IDirectPlay8Address*, void*, DWORD, DWORD, DWORD, DWORD, void* context, DPNHANDLE* handle, DWORD flags) {
    if (!description || description->dwSize != sizeof(DPN_APPLICATION_DESC)) return E_INVALIDARG;
    stopEnumeration(); const GUID app = description->guidApplication;
    if (flags & DPNENUMHOSTS_SYNC) { try { foundRooms(state, app, context); return S_OK; } catch (const std::exception& error) { failure(error); return DPNERR_NOCONNECTION; } }
    const DPNHANDLE operation = nextHandle++; if (handle) *handle = operation;
    enumCancel = std::make_shared<std::atomic<bool>>(false); auto cancelled = enumCancel; auto shared = state;
    enumerator = std::thread([shared, cancelled, app, context, operation] {
        while (!cancelled->load() && !shared->closed.load()) {
            try { foundRooms(shared, app, context, cancelled); } catch (const std::exception& error) { failure(error); }
            std::unique_lock<std::mutex> lock(shared->mutex);
            shared->changed.wait_for(lock, 3s, [&] { return cancelled->load() || shared->closed.load(); });
        }
        DPNMSG_ASYNC_OP_COMPLETE complete{}; complete.dwSize = sizeof(complete); complete.hAsyncOp = operation; complete.pvUserContext = context; complete.hResultCode = DPNERR_USERCANCEL;
        shared->notify(DPN_MSGID_ASYNC_OP_COMPLETE, &complete);
    });
    return DPNSUCCESS_PENDING;
}
HRESULT Peer::startRoom(const GUID& room, const std::wstring& token, bool host) {
    try {
        stopEnumeration(); if (receiver.joinable() || heartbeat.joinable()) return DPNERR_ALREADYCONNECTED;
        std::wstring name;
        { std::lock_guard<std::mutex> lock(state->mutex); name = state->name; state->room.id = room; state->connectionResult = DPNERR_CONNECTING; }
        auto socket = std::make_shared<CloudSocket>(state->endpoint, L"/v1/rooms/" + hex(&room, 16) + L"/play?role=" + (host ? L"host" : L"guest") + L"&name=" + urlEncode(name), token);
        { std::lock_guard<std::mutex> lock(state->mutex); state->socket = socket; }
        auto shared = state;
        receiver = std::thread([shared, socket, host] {
            try { Bytes bytes; while (!shared->closed.load() && socket->receive(bytes)) frame(shared, bytes, host); }
            catch (const std::exception& error) { failure(error); }
            socket->close();
            const bool wasConnected = shared->connected.exchange(false);
            { std::lock_guard<std::mutex> lock(shared->mutex); shared->connectionResult = DPNERR_CONNECTIONLOST; }
            shared->changed.notify_all();
            if (wasConnected && !shared->closed.load()) { DPNMSG_TERMINATE_SESSION message{}; message.dwSize = sizeof(message); message.hResultCode = DPNERR_CONNECTIONLOST; shared->notify(DPN_MSGID_TERMINATE_SESSION, &message); }
        });
        heartbeat = std::thread([shared, socket] {
            std::unique_lock<std::mutex> lock(shared->mutex);
            while (!shared->closed.load()) {
                if (shared->changed.wait_for(lock, 20s, [&] { return shared->closed.load() || shared->connectionResult == DPNERR_CONNECTIONLOST; })) break;
                lock.unlock(); try { socket->send(Bytes{17}); } catch (const std::exception&) { socket->close(); break; } lock.lock();
            }
        });
        std::unique_lock<std::mutex> lock(state->mutex);
        if (!state->changed.wait_for(lock, 8s, [&] { return state->connectionResult != DPNERR_CONNECTING || state->closed.load(); })) {
            lock.unlock(); socket->close(); return DPNERR_TIMEDOUT;
        }
        return state->connectionResult;
    } catch (const std::exception& error) { failure(error); return DPNERR_NOCONNECTION; }
}
HRESULT Peer::Host(const DPN_APPLICATION_DESC* description, IDirectPlay8Address**, DWORD, const DPN_SECURITY_DESC*, const DPN_SECURITY_CREDENTIALS*, void* context, DWORD) {
    if (!description || description->dwSize != sizeof(DPN_APPLICATION_DESC) || description->dwApplicationReservedDataSize > 8192) return E_INVALIDARG;
    try {
        Room room; room.app = description->guidApplication; room.name = description->pwszSessionName ? description->pwszSessionName : L"Public duel"; room.flags = description->dwFlags;
        if (room.name.empty()) room.name = L"Public duel";
        if (room.name.size() > 64 || (description->dwApplicationReservedDataSize && !description->pvApplicationReservedData)) return E_INVALIDARG;
        const auto* reserved = static_cast<const unsigned char*>(description->pvApplicationReservedData);
        if (description->dwApplicationReservedDataSize) room.reserved.assign(reserved, reserved + description->dwApplicationReservedDataSize);
        Writer request; const unsigned char magic[]{74,89,82,49}; request.raw(magic, 4).guid(room.app).u32(room.flags).text(room.name).blob(room.reserved);
        const Bytes response = http(state->endpoint, L"POST", L"/v1/rooms", request.bytes); Reader reader(response); room.id = reader.guid(); unsigned char secret[32]; reader.raw(secret, 32); reader.end();
        { std::lock_guard<std::mutex> lock(state->mutex); state->room = room; state->localContext = context; }
        return startRoom(room.id, hex(secret, 32), true);
    } catch (const std::exception& error) { failure(error); return DPNERR_NOCONNECTION; }
}
HRESULT Peer::Connect(const DPN_APPLICATION_DESC* description, IDirectPlay8Address* address, IDirectPlay8Address*, const DPN_SECURITY_DESC*, const DPN_SECURITY_CREDENTIALS*, const void*, DWORD, void* playerContext, void* asyncContext, DPNHANDLE* handle, DWORD flags) {
    if (!description || description->dwSize != sizeof(DPN_APPLICATION_DESC) || !address) return E_INVALIDARG;
    auto* online = dynamic_cast<Address*>(address); if (!online) return E_INVALIDARG;
    const DPNHANDLE operation = nextHandle++; if (handle) *handle = operation;
    try {
        const auto available = rooms(state->endpoint, description->guidApplication);
        const auto selected = std::find_if(available.begin(), available.end(), [&](const Room& room) { return room.id == online->room; });
        if (selected == available.end()) return DPNERR_NOCONNECTION;
        std::lock_guard<std::mutex> lock(state->mutex);
        state->localContext = playerContext; state->connectContext = asyncContext; state->connectHandle = operation;
        state->room = *selected;
    } catch (const std::exception& error) { failure(error); return DPNERR_NOCONNECTION; }
    const HRESULT result = startRoom(online->room, L"", false);
    return FAILED(result) ? result : (flags & DPNCONNECT_SYNC ? S_OK : DPNSUCCESS_PENDING);
}
HRESULT Peer::SetPeerInfo(const DPN_PLAYER_INFO* info, void* context, DPNHANDLE* handle, DWORD flags) {
    if (!info || info->dwSize != sizeof(DPN_PLAYER_INFO) || info->dwDataSize > 8192 || (info->dwDataSize && !info->pvData)) return E_INVALIDARG;
    { std::lock_guard<std::mutex> lock(state->mutex);
      if ((info->dwInfoFlags & DPNINFO_NAME) && info->pwszName) { if (wcslen(info->pwszName) > 64) return E_INVALIDARG; state->name = info->pwszName; }
      if (info->dwInfoFlags & DPNINFO_DATA) { const auto* p = static_cast<const unsigned char*>(info->pvData); state->playerData.clear(); if (info->dwDataSize) state->playerData.assign(p, p + info->dwDataSize); }
    }
    const DPNHANDLE operation = nextHandle++; if (handle) *handle = operation;
    if (!(flags & DPNSETPEERINFO_SYNC)) { DPNMSG_ASYNC_OP_COMPLETE complete{}; complete.dwSize = sizeof(complete); complete.hAsyncOp = operation; complete.pvUserContext = context; complete.hResultCode = S_OK; state->notify(DPN_MSGID_ASYNC_OP_COMPLETE, &complete); return DPNSUCCESS_PENDING; }
    return S_OK;
}
HRESULT Peer::GetPeerInfo(DPNID id, DPN_PLAYER_INFO* output, DWORD* size, DWORD) {
    if (!size) return E_POINTER; std::lock_guard<std::mutex> lock(state->mutex);
    const auto found = state->players.find(id); if (found == state->players.end()) return DPNERR_INVALIDPLAYER;
    const auto& player = found->second; const DWORD nameBytes = static_cast<DWORD>((player.name.size() + 1) * 2);
    const DWORD needed = sizeof(DPN_PLAYER_INFO) + nameBytes + static_cast<DWORD>(player.data.size()); const DWORD available = *size; *size = needed;
    if (!output || available < needed) return DPNERR_BUFFERTOOSMALL;
    std::memset(output, 0, needed); output->dwSize = sizeof(*output); output->dwInfoFlags = DPNINFO_NAME | DPNINFO_DATA; output->dwPlayerFlags = player.flags;
    output->pwszName = reinterpret_cast<wchar_t*>(output + 1); std::memcpy(output->pwszName, player.name.c_str(), nameBytes);
    output->dwDataSize = static_cast<DWORD>(player.data.size()); output->pvData = player.data.empty() ? nullptr : reinterpret_cast<unsigned char*>(output + 1) + nameBytes;
    if (!player.data.empty()) std::memcpy(output->pvData, player.data.data(), player.data.size()); return S_OK;
}
HRESULT Peer::SendTo(DPNID target, const DPN_BUFFER_DESC* buffers, DWORD count, DWORD, void* context, DPNHANDLE* handle, DWORD flags) {
    if (!buffers || !count) return E_INVALIDARG;
    try {
        std::shared_ptr<CloudSocket> socket; DPNID local;
        { std::lock_guard<std::mutex> lock(state->mutex); socket = state->socket; local = state->localId; }
        if (!state->connected.load() || !socket) return DPNERR_NOCONNECTION;
        if (target != 0 && target != 1 && target != 2) return DPNERR_INVALIDPLAYER;
        Writer packet; packet.u8(16).u32(target).u32(flags);
        for (DWORD i = 0; i < count; ++i) { if ((!buffers[i].pBufferData && buffers[i].dwBufferSize) || buffers[i].dwBufferSize > MaxPacket || packet.bytes.size() + buffers[i].dwBufferSize > MaxPacket) return E_INVALIDARG; packet.raw(buffers[i].pBufferData, buffers[i].dwBufferSize); }
        const DPNHANDLE operation = nextHandle++; if (handle) *handle = operation;
        if (target != local) socket->send(packet.bytes);
        if ((target == 0 || target == local) && !(flags & DPNSEND_NOLOOPBACK)) { Bytes payload(packet.bytes.begin() + 9, packet.bytes.end()); receiveData(state, local, std::move(payload)); }
        if (!(flags & DPNSEND_SYNC) && !(flags & DPNSEND_NOCOMPLETE)) { DPNMSG_SEND_COMPLETE complete{}; complete.dwSize = sizeof(complete); complete.hAsyncOp = operation; complete.pvUserContext = context; complete.hResultCode = S_OK; state->notify(DPN_MSGID_SEND_COMPLETE, &complete); }
        return flags & DPNSEND_SYNC ? S_OK : DPNSUCCESS_PENDING;
    } catch (const std::exception& error) { failure(error); return DPNERR_CONNECTIONLOST; }
}
HRESULT Peer::GetSendQueueInfo(DPNID, DWORD* messages, DWORD* bytes, DWORD) { if (!messages || !bytes) return E_POINTER; *messages = *bytes = 0; return S_OK; }
HRESULT Peer::GetApplicationDesc(DPN_APPLICATION_DESC* output, DWORD* size, DWORD) {
    if (!size) return E_POINTER; std::lock_guard<std::mutex> lock(state->mutex);
    const auto& room = state->room; const DWORD nameBytes = static_cast<DWORD>((room.name.size() + 1) * 2); const DWORD needed = sizeof(*output) + nameBytes + static_cast<DWORD>(room.reserved.size());
    const DWORD available = *size; *size = needed; if (!output || available < needed) return DPNERR_BUFFERTOOSMALL;
    *output = room.descriptor(); output->pwszSessionName = reinterpret_cast<wchar_t*>(output + 1); std::memcpy(output->pwszSessionName, room.name.c_str(), nameBytes);
    output->pvApplicationReservedData = room.reserved.empty() ? nullptr : reinterpret_cast<unsigned char*>(output + 1) + nameBytes;
    if (!room.reserved.empty()) std::memcpy(output->pvApplicationReservedData, room.reserved.data(), room.reserved.size()); return S_OK;
}
HRESULT Peer::SetApplicationDesc(const DPN_APPLICATION_DESC*, DWORD) { return E_NOTIMPL; }
HRESULT Peer::EnumPlayersAndGroups(DPNID* output, DWORD* count, DWORD) {
    if (!count) return E_POINTER; std::lock_guard<std::mutex> lock(state->mutex); const DWORD available = *count; *count = static_cast<DWORD>(state->players.size());
    if (!output || available < *count) return DPNERR_BUFFERTOOSMALL; DWORD index = 0; for (const auto& player : state->players) output[index++] = player.first; return S_OK;
}
HRESULT Peer::GetPeerAddress(DPNID id, IDirectPlay8Address** output, DWORD) { if (!output) return E_POINTER; std::lock_guard<std::mutex> lock(state->mutex); if (!state->players.count(id)) return DPNERR_INVALIDPLAYER; auto* address = new Address(); address->room = state->room.id; *output = address; return S_OK; }
HRESULT Peer::GetLocalHostAddresses(IDirectPlay8Address** output, DWORD* count, DWORD) { if (!count) return E_POINTER; const DWORD available = *count; *count = 1; if (!output || !available) return DPNERR_BUFFERTOOSMALL; auto* address = new Address(); {std::lock_guard<std::mutex> lock(state->mutex); address->room = state->room.id;} *output = address; return S_OK; }
HRESULT Peer::GetPlayerContext(DPNID id, void** output, DWORD) { if (!output) return E_POINTER; std::lock_guard<std::mutex> lock(state->mutex); auto found = state->players.find(id); if (found == state->players.end()) return DPNERR_INVALIDPLAYER; *output = found->second.context; return S_OK; }
HRESULT Peer::ReturnBuffer(DPNHANDLE handle, DWORD) { std::lock_guard<std::mutex> lock(state->mutex); return state->receiveBuffers.erase(handle) ? S_OK : DPNERR_INVALIDHANDLE; }
HRESULT Peer::GetCaps(DPN_CAPS* caps, DWORD) { if (!caps || caps->dwSize < sizeof(DPN_CAPS)) return E_INVALIDARG; caps->dwConnectTimeout = 10000; caps->dwConnectRetries = 1; caps->dwTimeoutUntilKeepAlive = 20000; return S_OK; }
HRESULT Peer::GetSPCaps(const GUID*, DPN_SP_CAPS* caps, DWORD) { if (!caps || caps->dwSize != sizeof(DPN_SP_CAPS)) return E_INVALIDARG; caps->dwNumThreads = 2; caps->dwBuffersPerThread = 1; caps->dwDefaultEnumCount = 1; caps->dwDefaultEnumRetryInterval = 3000; caps->dwDefaultEnumTimeout = 10000; caps->dwMaxEnumPayloadSize = 8192; return S_OK; }
HRESULT Peer::GetConnectionInfo(DPNID, DPN_CONNECTION_INFO* info, DWORD) { if (!info || info->dwSize != sizeof(*info)) return E_INVALIDARG; const DWORD size = info->dwSize; std::memset(info, 0, size); info->dwSize = size; return state->connected.load() ? S_OK : DPNERR_NOCONNECTION; }
HRESULT Peer::Close(DWORD) {
    state->closed.store(true); stopEnumeration(); state->connected.store(false); state->changed.notify_all();
    std::shared_ptr<CloudSocket> socket; { std::lock_guard<std::mutex> lock(state->mutex); socket = state->socket; }
    if (socket) socket->close();
    joinThread(enumerator); joinThread(receiver); joinThread(heartbeat);
    { std::lock_guard<std::recursive_mutex> lock(state->callbackMutex); state->callback = nullptr; }
    { std::lock_guard<std::mutex> lock(state->mutex); state->socket.reset(); state->players.clear(); state->receiveBuffers.clear(); }
    return S_OK;
}
}

#include "peer.hpp"
#include <iostream>
#include <chrono>

struct Observation {
    std::mutex mutex;
    std::condition_variable changed;
    GUID room{};
    IDirectPlay8Address* address = nullptr;
    int players = 0;
    joey::Bytes received;
    DWORD sender = 0;
    bool ended = false;
    bool blockDiscovery = false, discoveryEntered = false, releaseDiscovery = false;
    ~Observation() { if (address) address->Release(); }
};
static HRESULT WINAPI callback(void* context, DWORD id, void* value) {
    auto& observation = *static_cast<Observation*>(context);
    std::unique_lock<std::mutex> lock(observation.mutex);
    if (id == DPN_MSGID_CREATE_PLAYER) ++observation.players;
    if (id == DPN_MSGID_ENUM_HOSTS_RESPONSE) {
        auto* message = static_cast<DPNMSG_ENUM_HOSTS_RESPONSE*>(value);
        if (message->pApplicationDescription->dwCurrentPlayers == 1 && message->pApplicationDescription->pwszSessionName && std::wstring(message->pApplicationDescription->pwszSessionName) == L"Headless validation") {
            observation.room = message->pApplicationDescription->guidInstance;
            if (observation.address) observation.address->Release();
            observation.address = message->pAddressSender; observation.address->AddRef();
            if (observation.blockDiscovery) {
                observation.discoveryEntered = true; observation.changed.notify_all();
                observation.changed.wait(lock, [&] { return observation.releaseDiscovery; });
                observation.blockDiscovery = false;
            }
        }
    }
    if (id == DPN_MSGID_RECEIVE) { auto* message = static_cast<DPNMSG_RECEIVE*>(value); observation.sender = message->dpnidSender; observation.received.assign(message->pReceiveData, message->pReceiveData + message->dwReceiveDataSize); }
    if (id == DPN_MSGID_TERMINATE_SESSION) observation.ended = true;
    observation.changed.notify_all(); return S_OK;
}
static void require(bool condition, const char* message) { if (!condition) throw std::runtime_error(message); }
static void okay(HRESULT result, const char* message) { require(SUCCEEDED(result), message); }
int wmain(int argc, wchar_t** argv) {
    if (argc != 2) { std::cerr << "Usage: native-check.exe https://cloud-endpoint\n"; return 2; }
    Observation hostEvents, guestEvents, thirdEvents;
    joey::Peer host(argv[1]), guest(argv[1]), third(argv[1]);
    try {
        okay(host.Initialize(&hostEvents, callback, 0), "Host initialization failed");
        okay(guest.Initialize(&guestEvents, callback, 0), "Guest initialization failed");
        okay(third.Initialize(&thirdEvents, callback, 0), "Third initialization failed");
        DPN_PLAYER_INFO info{}; info.dwSize = sizeof(info); info.dwInfoFlags = DPNINFO_NAME; info.pwszName = const_cast<wchar_t*>(L"Host");
        okay(host.SetPeerInfo(&info, nullptr, nullptr, DPNSETPEERINFO_SYNC), "Host name failed");
        info.pwszName = const_cast<wchar_t*>(L"Friend"); okay(guest.SetPeerInfo(&info, nullptr, nullptr, DPNSETPEERINFO_SYNC), "Guest name failed");
        DPN_APPLICATION_DESC description{}; description.dwSize = sizeof(description); description.dwMaxPlayers = 2;
        CoCreateGuid(&description.guidApplication); description.pwszSessionName = const_cast<wchar_t*>(L"Headless validation");
        joey::Bytes applicationData{0,255,128,42}; description.pvApplicationReservedData = applicationData.data(); description.dwApplicationReservedDataSize = static_cast<DWORD>(applicationData.size());
        std::cerr << "CHECK: creating live room\n";
        okay(host.Host(&description, nullptr, 0, nullptr, nullptr, nullptr, 0), "Cloud hosting failed");
        std::cerr << "CHECK: discovering live room\n";
        guestEvents.blockDiscovery = true;
        DPNHANDLE discovery = 0;
        okay(guest.EnumHosts(&description, nullptr, nullptr, nullptr, 0, 1, 0, 0, nullptr, &discovery, 0), "Asynchronous discovery failed");
        { std::unique_lock<std::mutex> lock(guestEvents.mutex); require(guestEvents.changed.wait_for(lock, std::chrono::seconds(5), [&] {return guestEvents.discoveryEntered;}), "Discovery callback did not begin"); }
        const auto cancelStart = std::chrono::steady_clock::now();
        okay(guest.CancelAsyncOperation(discovery, 0), "Discovery cancellation failed");
        require(std::chrono::steady_clock::now() - cancelStart < std::chrono::milliseconds(500), "Cancellation blocked on the application's discovery callback");
        { std::unique_lock<std::mutex> lock(guestEvents.mutex); guestEvents.releaseDiscovery = true; guestEvents.changed.notify_all(); require(guestEvents.changed.wait_for(lock, std::chrono::seconds(5), [&] {return !guestEvents.blockDiscovery;}), "Discovery callback did not finish"); }
        okay(guest.EnumHosts(&description, nullptr, nullptr, nullptr, 0, 1, 0, 0, nullptr, nullptr, DPNENUMHOSTS_SYNC), "Room discovery failed");
        require(guestEvents.address != nullptr, "Hosted room was not listed");
        std::cerr << "CHECK: joining live room\n";
        okay(guest.Connect(&description, guestEvents.address, nullptr, nullptr, nullptr, nullptr, 0, nullptr, nullptr, nullptr, 0), "Cloud join failed");
        {
            std::unique_lock<std::mutex> lock(hostEvents.mutex);
            require(hostEvents.changed.wait_for(lock, std::chrono::seconds(5), [&] {return hostEvents.players == 2;}), "Host did not see guest");
        }
        require(guestEvents.players == 2, "Guest did not see both players");
        DWORD sessionSize = 0;
        require(guest.GetApplicationDesc(nullptr, &sessionSize, 0) == DPNERR_BUFFERTOOSMALL, "Session size negotiation failed");
        joey::Bytes sessionBytes(sessionSize); auto* session = reinterpret_cast<DPN_APPLICATION_DESC*>(sessionBytes.data());
        okay(guest.GetApplicationDesc(session, &sessionSize, 0), "Guest session metadata is missing");
        require(session->guidInstance == guestEvents.room && session->guidApplication == description.guidApplication && session->dwCurrentPlayers == 2 && std::wstring(session->pwszSessionName) == L"Headless validation", "Guest session identity is wrong");
        require(session->dwApplicationReservedDataSize == applicationData.size() && std::memcmp(session->pvApplicationReservedData, applicationData.data(), applicationData.size()) == 0, "Session configuration bytes were lost");
        std::cerr << "CHECK: joined; testing idle heartbeat\n";
        std::this_thread::sleep_for(std::chrono::seconds(25));
        { std::lock_guard<std::mutex> lock(hostEvents.mutex); require(!hostEvents.ended, "Idle host connection dropped between moves"); }
        { std::lock_guard<std::mutex> lock(guestEvents.mutex); require(!guestEvents.ended, "Idle guest connection dropped between moves"); }
        DWORD size = 0; require(guest.GetPeerInfo(1, nullptr, &size, 0) == DPNERR_BUFFERTOOSMALL, "Player size negotiation failed");
        joey::Bytes playerBytes(size); auto* player = reinterpret_cast<DPN_PLAYER_INFO*>(playerBytes.data()); player->dwSize = sizeof(*player);
        okay(guest.GetPeerInfo(1, player, &size, 0), "Host metadata missing");
        require((player->dwPlayerFlags & DPNPLAYER_HOST) && !(player->dwPlayerFlags & DPNPLAYER_LOCAL) && std::wstring(player->pwszName) == L"Host", "Host identity is wrong");
        require(FAILED(third.Connect(&description, guestEvents.address, nullptr, nullptr, nullptr, nullptr, 0, nullptr, nullptr, nullptr, 0)), "Third player joined a full room");
        std::cerr << "CHECK: capacity verified; exchanging payloads\n";
        joey::Bytes payload{2,0,255,128,1,0,42}; DPN_BUFFER_DESC buffer{static_cast<DWORD>(payload.size()), payload.data()};
        okay(host.SendTo(2, &buffer, 1, 0, nullptr, nullptr, DPNSEND_GUARANTEED | DPNSEND_NOLOOPBACK), "Host send failed");
        { std::unique_lock<std::mutex> lock(guestEvents.mutex); require(guestEvents.changed.wait_for(lock, std::chrono::seconds(5), [&] {return !guestEvents.received.empty();}), "Guest did not receive duel bytes"); require(guestEvents.sender == 1 && guestEvents.received == payload, "Duel bytes changed in relay"); }
        payload = {255,0,12,128,0}; buffer.dwBufferSize = static_cast<DWORD>(payload.size()); buffer.pBufferData = payload.data();
        okay(guest.SendTo(1, &buffer, 1, 0, nullptr, nullptr, DPNSEND_GUARANTEED | DPNSEND_NOLOOPBACK), "Guest send failed");
        { std::unique_lock<std::mutex> lock(hostEvents.mutex); require(hostEvents.changed.wait_for(lock, std::chrono::seconds(5), [&] {return !hostEvents.received.empty();}), "Host did not receive duel bytes"); require(hostEvents.sender == 2 && hostEvents.received == payload, "Reverse duel bytes changed"); }
        std::cerr << "CHECK: payloads verified; closing guest\n";
        guest.Close(0);
        std::cerr << "CHECK: guest closed; awaiting disconnect\n";
        { std::unique_lock<std::mutex> lock(hostEvents.mutex); require(hostEvents.changed.wait_for(lock, std::chrono::seconds(8), [&] {return hostEvents.ended;}), "Disconnect was not propagated"); }
        std::cerr << "CHECK: closing host\n";
        host.Close(0); third.Close(0);
        std::cout << "PASS: native hosting, public discovery, nonblocking cancellation, idle connections, session metadata, joining, player identities, capacity, bidirectional payloads, and disconnect\n";
        return 0;
    } catch (const std::exception& error) { std::cerr << "FAIL: " << error.what() << "\n"; return 1; }
}

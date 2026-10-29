#pragma once
#include "address.hpp"
#include "transport.hpp"
#include <condition_variable>
#include <thread>

namespace joey {
struct Player { std::wstring name; Bytes data; DWORD flags = 0; void* context = nullptr; };
struct Room {
    GUID id{}, app{}; DWORD flags = 0, maximum = 2, count = 0;
    std::wstring name; Bytes reserved;
    DPN_APPLICATION_DESC descriptor() const;
};
struct PeerState {
    explicit PeerState(std::wstring value) : endpoint(std::move(value)) {}
    std::wstring endpoint, name = L"Duelist";
    Bytes playerData;
    PFNDPNMESSAGEHANDLER callback = nullptr;
    void* callbackContext = nullptr;
    void* localContext = nullptr;
    void* connectContext = nullptr;
    DPNHANDLE connectHandle = 0;
    DPNID localId = 0;
    std::map<DPNID, Player> players;
    std::map<DPNHANDLE, std::shared_ptr<Bytes>> receiveBuffers;
    DPNHANDLE nextBuffer = 1;
    Room room;
    std::mutex mutex;
    std::recursive_mutex callbackMutex;
    std::condition_variable changed;
    std::atomic<bool> closed{false}, enumerating{false}, connected{false};
    HRESULT connectionResult = DPNERR_CONNECTING;
    std::shared_ptr<CloudSocket> socket;
    HRESULT notify(DWORD message, void* value);
};
class Peer final : public IDirectPlay8Peer {
    std::atomic<ULONG> references{1};
    std::atomic<DPNHANDLE> nextHandle{1};
    std::shared_ptr<PeerState> state;
    std::thread receiver, heartbeat, enumerator;
    HRESULT startRoom(const GUID& room, const std::wstring& token, bool host);
    void stopEnumeration();
public:
    explicit Peer(const std::wstring& endpoint) : state(std::make_shared<PeerState>(endpoint)) {}
    ~Peer();
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID, void**) override;
    ULONG STDMETHODCALLTYPE AddRef() override { return ++references; }
    ULONG STDMETHODCALLTYPE Release() override { const auto count = --references; if (!count) delete this; return count; }
    HRESULT STDMETHODCALLTYPE Initialize(void*, PFNDPNMESSAGEHANDLER, DWORD) override;
    HRESULT STDMETHODCALLTYPE EnumServiceProviders(const GUID*, const GUID*, DPN_SERVICE_PROVIDER_INFO*, DWORD*, DWORD*, DWORD) override;
    HRESULT STDMETHODCALLTYPE CancelAsyncOperation(DPNHANDLE, DWORD) override;
    HRESULT STDMETHODCALLTYPE Connect(const DPN_APPLICATION_DESC*, IDirectPlay8Address*, IDirectPlay8Address*, const DPN_SECURITY_DESC*, const DPN_SECURITY_CREDENTIALS*, const void*, DWORD, void*, void*, DPNHANDLE*, DWORD) override;
    HRESULT STDMETHODCALLTYPE SendTo(DPNID, const DPN_BUFFER_DESC*, DWORD, DWORD, void*, DPNHANDLE*, DWORD) override;
    HRESULT STDMETHODCALLTYPE GetSendQueueInfo(DPNID, DWORD*, DWORD*, DWORD) override;
    HRESULT STDMETHODCALLTYPE Host(const DPN_APPLICATION_DESC*, IDirectPlay8Address**, DWORD, const DPN_SECURITY_DESC*, const DPN_SECURITY_CREDENTIALS*, void*, DWORD) override;
    HRESULT STDMETHODCALLTYPE GetApplicationDesc(DPN_APPLICATION_DESC*, DWORD*, DWORD) override;
    HRESULT STDMETHODCALLTYPE SetApplicationDesc(const DPN_APPLICATION_DESC*, DWORD) override;
    HRESULT STDMETHODCALLTYPE CreateGroup(const DPN_GROUP_INFO*, void*, void*, DPNHANDLE*, DWORD) override { return E_NOTIMPL; }
    HRESULT STDMETHODCALLTYPE DestroyGroup(DPNID, void*, DPNHANDLE*, DWORD) override { return E_NOTIMPL; }
    HRESULT STDMETHODCALLTYPE AddPlayerToGroup(DPNID, DPNID, void*, DPNHANDLE*, DWORD) override { return E_NOTIMPL; }
    HRESULT STDMETHODCALLTYPE RemovePlayerFromGroup(DPNID, DPNID, void*, DPNHANDLE*, DWORD) override { return E_NOTIMPL; }
    HRESULT STDMETHODCALLTYPE SetGroupInfo(DPNID, DPN_GROUP_INFO*, void*, DPNHANDLE*, DWORD) override { return E_NOTIMPL; }
    HRESULT STDMETHODCALLTYPE GetGroupInfo(DPNID, DPN_GROUP_INFO*, DWORD*, DWORD) override { return E_NOTIMPL; }
    HRESULT STDMETHODCALLTYPE EnumPlayersAndGroups(DPNID*, DWORD*, DWORD) override;
    HRESULT STDMETHODCALLTYPE EnumGroupMembers(DPNID, DPNID*, DWORD*, DWORD) override { return E_NOTIMPL; }
    HRESULT STDMETHODCALLTYPE SetPeerInfo(const DPN_PLAYER_INFO*, void*, DPNHANDLE*, DWORD) override;
    HRESULT STDMETHODCALLTYPE GetPeerInfo(DPNID, DPN_PLAYER_INFO*, DWORD*, DWORD) override;
    HRESULT STDMETHODCALLTYPE GetPeerAddress(DPNID, IDirectPlay8Address**, DWORD) override;
    HRESULT STDMETHODCALLTYPE GetLocalHostAddresses(IDirectPlay8Address**, DWORD*, DWORD) override;
    HRESULT STDMETHODCALLTYPE Close(DWORD) override;
    HRESULT STDMETHODCALLTYPE EnumHosts(DPN_APPLICATION_DESC*, IDirectPlay8Address*, IDirectPlay8Address*, void*, DWORD, DWORD, DWORD, DWORD, void*, DPNHANDLE*, DWORD) override;
    HRESULT STDMETHODCALLTYPE DestroyPeer(DPNID, const void*, DWORD, DWORD) override { return E_NOTIMPL; }
    HRESULT STDMETHODCALLTYPE ReturnBuffer(DPNHANDLE, DWORD) override;
    HRESULT STDMETHODCALLTYPE GetPlayerContext(DPNID, void**, DWORD) override;
    HRESULT STDMETHODCALLTYPE GetGroupContext(DPNID, void**, DWORD) override { return E_NOTIMPL; }
    HRESULT STDMETHODCALLTYPE GetCaps(DPN_CAPS*, DWORD) override;
    HRESULT STDMETHODCALLTYPE SetCaps(const DPN_CAPS*, DWORD) override { return S_OK; }
    HRESULT STDMETHODCALLTYPE SetSPCaps(const GUID*, const DPN_SP_CAPS*, DWORD) override { return S_OK; }
    HRESULT STDMETHODCALLTYPE GetSPCaps(const GUID*, DPN_SP_CAPS*, DWORD) override;
    HRESULT STDMETHODCALLTYPE GetConnectionInfo(DPNID, DPN_CONNECTION_INFO*, DWORD) override;
    HRESULT STDMETHODCALLTYPE RegisterLobby(DPNHANDLE, IDirectPlay8LobbiedApplication*, DWORD) override { return E_NOTIMPL; }
    HRESULT STDMETHODCALLTYPE TerminateSession(void*, DWORD, DWORD) override { return Close(0); }
};
}

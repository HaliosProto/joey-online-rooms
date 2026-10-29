#include "peer.hpp"
#include <mutex>

namespace {
HMODULE moduleHandle = nullptr;
HMODULE realInput = nullptr;
std::once_flag started;
using CreateInstance = HRESULT (WINAPI*)(REFCLSID, LPUNKNOWN, DWORD, REFIID, LPVOID*);
CreateInstance originalCreate = nullptr;
std::wstring endpoint;

HRESULT WINAPI onlineCreate(REFCLSID clsid, LPUNKNOWN outer, DWORD context, REFIID iid, void** output) {
    if (!output) return E_POINTER;
    try {
        if (clsid == CLSID_DirectPlay8Peer || clsid == CLSID_DirectPlay8Address) {
            if (outer) return CLASS_E_NOAGGREGATION;
            IUnknown* object = clsid == CLSID_DirectPlay8Peer
                ? static_cast<IUnknown*>(new joey::Peer(endpoint)) : static_cast<IUnknown*>(new joey::Address());
            const auto result = object->QueryInterface(iid, output); object->Release(); return result;
        }
    } catch (...) { *output = nullptr; return E_OUTOFMEMORY; }
    return originalCreate(clsid, outer, context, iid, output);
}
void initialize() {
    wchar_t system[MAX_PATH]{};
    if (!GetSystemDirectoryW(system, MAX_PATH)) return;
    // Wine's COM loader resolves DirectInput to an absolute system path.
    // The Mac launcher preserves Wine's real input module under a separate name
    // before placing this proxy in its isolated prefix; Windows keeps its usual DLL.
    const bool wine = GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "wine_get_version") != nullptr;
    const std::wstring input = std::wstring(system) + (wine ? L"\\joey-system-dinput.dll" : L"\\dinput.dll");
    realInput = LoadLibraryExW(input.c_str(), nullptr, LOAD_LIBRARY_SEARCH_SYSTEM32);

    wchar_t filename[MAX_PATH]{}; GetModuleFileNameW(moduleHandle, filename, MAX_PATH);
    std::wstring directory(filename); directory.resize(directory.find_last_of(L"\\/") + 1);
    const auto config = directory + L"joey-online.ini";
    if (GetPrivateProfileIntW(L"Online", L"Enabled", 0, config.c_str()) != 1) return;
    wchar_t url[2048]{}; GetPrivateProfileStringW(L"Online", L"Endpoint", L"", url, 2048, config.c_str()); endpoint = url;
    if (endpoint.empty()) return;

    auto* base = reinterpret_cast<unsigned char*>(GetModuleHandleW(nullptr));
    const auto* dos = reinterpret_cast<IMAGE_DOS_HEADER*>(base);
    if (dos->e_magic != IMAGE_DOS_SIGNATURE) return;
    const auto* nt = reinterpret_cast<IMAGE_NT_HEADERS32*>(base + dos->e_lfanew);
    if (nt->Signature != IMAGE_NT_SIGNATURE || nt->FileHeader.Machine != IMAGE_FILE_MACHINE_I386 || nt->OptionalHeader.SizeOfImage < 0x1DB000) return;
    // This known call site gates the only in-memory import-slot patch.
    const unsigned char expected[]{0x68,0x00,0xDB,0x5D,0x00,0xFF,0x15,0x38,0xA3,0x5D,0x00};
    if (std::memcmp(base + 0x436AD, expected, sizeof(expected)) != 0) return;
    auto* slot = reinterpret_cast<CreateInstance*>(base + 0x1DA338);
    auto* ole = GetModuleHandleW(L"ole32.dll");
    originalCreate = ole ? reinterpret_cast<CreateInstance>(GetProcAddress(ole, "CoCreateInstance")) : nullptr;
    if (!originalCreate || *slot != originalCreate) return;
    DWORD protection = 0;
    if (!VirtualProtect(slot, sizeof(*slot), PAGE_READWRITE, &protection)) return;
    *slot = onlineCreate;
    DWORD unused = 0; VirtualProtect(slot, sizeof(*slot), protection, &unused);
    OutputDebugStringA("Joey Online: integrated cloud networking enabled\n");
}
FARPROC inputProc(const char* name) { std::call_once(started, initialize); return realInput ? GetProcAddress(realInput, name) : nullptr; }
}

extern "C" HRESULT WINAPI ProxyDirectInputCreateA(HINSTANCE instance, DWORD version, void** output, IUnknown* outer) {
    using Fn = HRESULT (WINAPI*)(HINSTANCE,DWORD,void**,IUnknown*); const auto fn = reinterpret_cast<Fn>(inputProc("DirectInputCreateA")); return fn ? fn(instance,version,output,outer) : E_NOTIMPL;
}
extern "C" HRESULT WINAPI ProxyDirectInputCreateW(HINSTANCE instance, DWORD version, void** output, IUnknown* outer) {
    using Fn = HRESULT (WINAPI*)(HINSTANCE,DWORD,void**,IUnknown*); const auto fn = reinterpret_cast<Fn>(inputProc("DirectInputCreateW")); return fn ? fn(instance,version,output,outer) : E_NOTIMPL;
}
extern "C" HRESULT WINAPI ProxyDirectInputCreateEx(HINSTANCE instance, DWORD version, REFIID iid, void** output, IUnknown* outer) {
    using Fn = HRESULT (WINAPI*)(HINSTANCE,DWORD,REFIID,void**,IUnknown*); const auto fn = reinterpret_cast<Fn>(inputProc("DirectInputCreateEx")); return fn ? fn(instance,version,iid,output,outer) : E_NOTIMPL;
}
extern "C" HRESULT WINAPI ProxyDllGetClassObject(REFCLSID clsid, REFIID iid, void** output) {
    using Fn = HRESULT (WINAPI*)(REFCLSID,REFIID,void**); const auto fn = reinterpret_cast<Fn>(inputProc("DllGetClassObject")); return fn ? fn(clsid,iid,output) : CLASS_E_CLASSNOTAVAILABLE;
}
extern "C" HRESULT WINAPI ProxyDllCanUnloadNow() { return S_FALSE; }
BOOL WINAPI DllMain(HINSTANCE instance, DWORD reason, LPVOID) {
    if (reason == DLL_PROCESS_ATTACH) { moduleHandle = instance; DisableThreadLibraryCalls(instance); }
    // Never perform networking, load dependencies, or wait for threads under the loader lock.
    return TRUE;
}

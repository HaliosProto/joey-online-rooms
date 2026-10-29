#pragma once
#include "dplay8.h"
#include "wire.hpp"
#include <atomic>
#include <map>

namespace joey {
class Address final : public IDirectPlay8Address {
    struct Component { DWORD type; Bytes data; };
    std::atomic<ULONG> references{1};
    GUID provider = CLSID_DP8SP_TCPIP, device{};
    Bytes userData;
    std::map<std::wstring, Component> components;
    static HRESULT copy(const void* source, DWORD size, void* target, DWORD* capacity) {
        if (!capacity) return E_POINTER;
        const DWORD available = *capacity; *capacity = size;
        if (!target || available < size) return DPNERR_BUFFERTOOSMALL;
        if (size) std::memcpy(target, source, size);
        return S_OK;
    }
public:
    GUID room{};
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid, void** output) override {
        if (!output) return E_POINTER; *output = nullptr;
        if (iid != IID_IUnknown && iid != IID_IDirectPlay8Address) return E_NOINTERFACE;
        *output = static_cast<IDirectPlay8Address*>(this); AddRef(); return S_OK;
    }
    ULONG STDMETHODCALLTYPE AddRef() override { return ++references; }
    ULONG STDMETHODCALLTYPE Release() override { const auto count = --references; if (!count) delete this; return count; }
    HRESULT STDMETHODCALLTYPE BuildFromURLW(WCHAR*) override { return E_NOTIMPL; }
    HRESULT STDMETHODCALLTYPE BuildFromURLA(CHAR*) override { return E_NOTIMPL; }
    HRESULT STDMETHODCALLTYPE Duplicate(IDirectPlay8Address** output) override {
        if (!output) return E_POINTER;
        auto* result = new Address(); result->provider = provider; result->device = device; result->room = room; result->userData = userData; result->components = components; *output = result; return S_OK;
    }
    HRESULT STDMETHODCALLTYPE SetEqual(IDirectPlay8Address* other) override {
        auto* source = dynamic_cast<Address*>(other); if (!source) return E_INVALIDARG;
        provider = source->provider; device = source->device; room = source->room; userData = source->userData; components = source->components; return S_OK;
    }
    HRESULT STDMETHODCALLTYPE IsEqual(IDirectPlay8Address* other) override { auto* source = dynamic_cast<Address*>(other); return source && source->room == room ? DPNSUCCESS_EQUAL : DPNSUCCESS_NOTEQUAL; }
    HRESULT STDMETHODCALLTYPE Clear() override { components.clear(); userData.clear(); room = GUID{}; return S_OK; }
    HRESULT STDMETHODCALLTYPE GetURLW(WCHAR* output, DWORD* count) override {
        if (!count) return E_POINTER; const auto value = L"joey-online:/room=" + hex(&room, 16); DWORD bytes = *count * 2;
        const HRESULT result = copy(value.c_str(), static_cast<DWORD>((value.size() + 1) * 2), output, &bytes); *count = bytes / 2; return result;
    }
    HRESULT STDMETHODCALLTYPE GetURLA(CHAR* output, DWORD* count) override {
        const auto wide = L"joey-online:/room=" + hex(&room, 16); std::string value; for (wchar_t character : wide) value += static_cast<char>(character); return copy(value.c_str(), static_cast<DWORD>(value.size() + 1), output, count);
    }
    HRESULT STDMETHODCALLTYPE GetSP(GUID* output) override { if (!output) return E_POINTER; *output = provider; return S_OK; }
    HRESULT STDMETHODCALLTYPE GetUserData(void* output, DWORD* size) override { return copy(userData.data(), static_cast<DWORD>(userData.size()), output, size); }
    HRESULT STDMETHODCALLTYPE SetSP(const GUID* value) override { if (!value) return E_POINTER; provider = *value; return S_OK; }
    HRESULT STDMETHODCALLTYPE SetUserData(const void* value, DWORD size) override { if (size && !value) return E_POINTER; const auto* bytes = static_cast<const unsigned char*>(value); userData.clear(); if (size) userData.assign(bytes, bytes + size); return S_OK; }
    HRESULT STDMETHODCALLTYPE GetNumComponents(DWORD* output) override { if (!output) return E_POINTER; *output = static_cast<DWORD>(components.size()); return S_OK; }
    HRESULT STDMETHODCALLTYPE GetComponentByName(const WCHAR* name, void* output, DWORD* size, DWORD* type) override {
        if (!name || !type) return E_POINTER; const auto found = components.find(name); if (found == components.end()) return DPNERR_DOESNOTEXIST;
        *type = found->second.type; return copy(found->second.data.data(), static_cast<DWORD>(found->second.data.size()), output, size);
    }
    HRESULT STDMETHODCALLTYPE GetComponentByIndex(DWORD index, WCHAR* name, DWORD* nameCount, void* output, DWORD* size, DWORD* type) override {
        if (!nameCount || !size || !type) return E_POINTER; if (index >= components.size()) return DPNERR_DOESNOTEXIST;
        auto found = components.begin(); std::advance(found, index); const DWORD needed = static_cast<DWORD>(found->first.size() + 1);
        const DWORD available = *nameCount; *nameCount = needed;
        if (!name || available < needed) return DPNERR_BUFFERTOOSMALL;
        std::memcpy(name, found->first.c_str(), needed * 2); return GetComponentByName(name, output, size, type);
    }
    HRESULT STDMETHODCALLTYPE AddComponent(const WCHAR* name, const void* value, DWORD size, DWORD type) override {
        if (!name || (!value && size) || size > 8192) return E_INVALIDARG;
        const auto* bytes = static_cast<const unsigned char*>(value); Component component{type, {}}; if (size) component.data.assign(bytes, bytes + size); components[name] = std::move(component); return S_OK;
    }
    HRESULT STDMETHODCALLTYPE GetDevice(GUID* output) override { if (!output) return E_POINTER; *output = device; return S_OK; }
    HRESULT STDMETHODCALLTYPE SetDevice(const GUID* value) override { if (!value) return E_POINTER; device = *value; return S_OK; }
    HRESULT STDMETHODCALLTYPE BuildFromDirectPlay4Address(void*, DWORD) override { return E_NOTIMPL; }
};
}

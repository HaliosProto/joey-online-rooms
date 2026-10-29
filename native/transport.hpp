#pragma once
#include "wire.hpp"
#include <winhttp.h>
#include <atomic>
#include <mutex>
#include <memory>

namespace joey {
struct InternetHandle {
    HINTERNET value = nullptr;
    InternetHandle() = default;
    explicit InternetHandle(HINTERNET handle) : value(handle) { if (!handle) throw std::runtime_error("Could not open cloud connection"); }
    ~InternetHandle() { if (value) WinHttpCloseHandle(value); }
    InternetHandle(const InternetHandle&) = delete;
    InternetHandle& operator=(const InternetHandle&) = delete;
};
struct CloudConnection {
    InternetHandle session, connection;
    std::wstring prefix;
    bool secure;
    explicit CloudConnection(const std::wstring& endpoint);
    std::unique_ptr<InternetHandle> request(const wchar_t* method, const std::wstring& path);
};
Bytes http(const std::wstring& endpoint, const wchar_t* method, const std::wstring& path, const Bytes& body = {});
class CloudSocket {
    std::unique_ptr<CloudConnection> connection;
    std::atomic<HINTERNET> socket{nullptr};
    std::mutex sendMutex;
public:
    CloudSocket(const std::wstring& endpoint, const std::wstring& path, const std::wstring& hostToken);
    ~CloudSocket() { close(); }
    void send(const Bytes& message);
    bool receive(Bytes& message);
    void close();
};
}

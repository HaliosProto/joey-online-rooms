#include "transport.hpp"

namespace joey {
static void check(BOOL result) { if (!result) throw std::runtime_error("Cloud request failed"); }
CloudConnection::CloudConnection(const std::wstring& endpoint) :
    session(WinHttpOpen(L"JoeyOnline/1", WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0)), secure(false) {
    URL_COMPONENTS parts{}; parts.dwStructSize = sizeof(parts); parts.dwHostNameLength = static_cast<DWORD>(-1); parts.dwUrlPathLength = static_cast<DWORD>(-1); parts.dwExtraInfoLength = static_cast<DWORD>(-1);
    check(WinHttpCrackUrl(endpoint.c_str(), 0, 0, &parts));
    const std::wstring hostname(parts.lpszHostName, parts.dwHostNameLength);
    secure = parts.nScheme == INTERNET_SCHEME_HTTPS;
    if (!secure && !(parts.nScheme == INTERNET_SCHEME_HTTP && (hostname == L"127.0.0.1" || hostname == L"localhost")))
        throw std::runtime_error("Cloud endpoint must use HTTPS");
    if (parts.dwExtraInfoLength || parts.lpszUserName || parts.lpszPassword) throw std::runtime_error("Invalid cloud endpoint");
    if (parts.dwUrlPathLength) prefix.assign(parts.lpszUrlPath, parts.dwUrlPathLength);
    while (!prefix.empty() && prefix.back() == L'/') prefix.pop_back();
    check(WinHttpSetTimeouts(session.value, 4000, 5000, 5000, 10000));
    connection.value = WinHttpConnect(session.value, hostname.c_str(), parts.nPort, 0);
    if (!connection.value) throw std::runtime_error("Cloud host unavailable");
}
std::unique_ptr<InternetHandle> CloudConnection::request(const wchar_t* method, const std::wstring& path) {
    auto result = std::make_unique<InternetHandle>(WinHttpOpenRequest(connection.value, method, (prefix + path).c_str(), nullptr, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, secure ? WINHTTP_FLAG_SECURE : 0));
    DWORD redirect = WINHTTP_OPTION_REDIRECT_POLICY_NEVER;
    check(WinHttpSetOption(result->value, WINHTTP_OPTION_REDIRECT_POLICY, &redirect, sizeof(redirect)));
    return result;
}
static DWORD status(HINTERNET request) {
    DWORD code = 0, size = sizeof(code);
    check(WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, WINHTTP_HEADER_NAME_BY_INDEX, &code, &size, WINHTTP_NO_HEADER_INDEX));
    return code;
}
Bytes http(const std::wstring& endpoint, const wchar_t* method, const std::wstring& path, const Bytes& body) {
    CloudConnection cloud(endpoint);
    auto request = cloud.request(method, path);
    check(WinHttpSendRequest(request->value, L"Content-Type: application/octet-stream\r\n", static_cast<DWORD>(-1), body.empty() ? WINHTTP_NO_REQUEST_DATA : const_cast<unsigned char*>(body.data()), static_cast<DWORD>(body.size()), static_cast<DWORD>(body.size()), 0));
    check(WinHttpReceiveResponse(request->value, nullptr));
    const DWORD code = status(request->value);
    if (code < 200 || code >= 300) throw std::runtime_error(code == 429 ? "Cloud lobby is at its free capacity limit" : "Cloud lobby request rejected");
    Bytes bytes;
    while (true) {
        unsigned char buffer[8192]; DWORD count = 0;
        check(WinHttpReadData(request->value, buffer, sizeof(buffer), &count));
        if (!count) break;
        if (bytes.size() + count > 1048576) throw std::runtime_error("Cloud response too large");
        bytes.insert(bytes.end(), buffer, buffer + count);
    }
    return bytes;
}
CloudSocket::CloudSocket(const std::wstring& endpoint, const std::wstring& path, const std::wstring& hostToken) : connection(std::make_unique<CloudConnection>(endpoint)) {
    // HTTP lookups have a short timeout; a turn-based duel must survive pauses between moves.
    check(WinHttpSetTimeouts(connection->session.value, 4000, 5000, 5000, 45000));
    auto request = connection->request(L"GET", path);
    check(WinHttpSetOption(request->value, WINHTTP_OPTION_UPGRADE_TO_WEB_SOCKET, nullptr, 0));
    const std::wstring headers = hostToken.empty() ? L"" : L"Authorization: Bearer " + hostToken + L"\r\n";
    check(WinHttpSendRequest(request->value, headers.empty() ? WINHTTP_NO_ADDITIONAL_HEADERS : headers.c_str(), headers.empty() ? 0 : static_cast<DWORD>(-1), WINHTTP_NO_REQUEST_DATA, 0, 0, 0));
    check(WinHttpReceiveResponse(request->value, nullptr));
    const DWORD code = status(request->value);
    if (code != 101) throw std::runtime_error(code == 409 ? "This room is full or its host is not ready" : "Could not join this cloud room");
    auto upgraded = WinHttpWebSocketCompleteUpgrade(request->value, 0);
    if (!upgraded) throw std::runtime_error("Could not start cloud relay");
    socket.store(upgraded);
}
void CloudSocket::send(const Bytes& bytes) {
    std::lock_guard<std::mutex> guard(sendMutex);
    const auto handle = socket.load();
    if (!handle || bytes.size() > MaxPacket || WinHttpWebSocketSend(handle, WINHTTP_WEB_SOCKET_BINARY_MESSAGE_BUFFER_TYPE, const_cast<unsigned char*>(bytes.data()), static_cast<DWORD>(bytes.size())) != NO_ERROR)
        throw std::runtime_error("Cloud relay disconnected");
}
bool CloudSocket::receive(Bytes& bytes) {
    bytes.clear();
    while (true) {
        const auto handle = socket.load();
        if (!handle) return false;
        unsigned char buffer[8192]; DWORD count = 0; WINHTTP_WEB_SOCKET_BUFFER_TYPE type;
        const DWORD error = WinHttpWebSocketReceive(handle, buffer, sizeof(buffer), &count, &type);
        if (error != NO_ERROR || type == WINHTTP_WEB_SOCKET_CLOSE_BUFFER_TYPE) return false;
        if (type != WINHTTP_WEB_SOCKET_BINARY_MESSAGE_BUFFER_TYPE && type != WINHTTP_WEB_SOCKET_BINARY_FRAGMENT_BUFFER_TYPE) throw std::runtime_error("Unexpected cloud relay format");
        if (bytes.size() + count > MaxPacket) throw std::runtime_error("Cloud relay packet too large");
        bytes.insert(bytes.end(), buffer, buffer + count);
        if (type == WINHTTP_WEB_SOCKET_BINARY_MESSAGE_BUFFER_TYPE) return true;
    }
}
void CloudSocket::close() {
    std::lock_guard<std::mutex> guard(sendMutex);
    const auto handle = socket.exchange(nullptr);
    if (handle) WinHttpCloseHandle(handle);
}
}

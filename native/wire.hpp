#pragma once
#include <windows.h>
#include <string>
#include <vector>
#include <stdexcept>
#include <cstring>

namespace joey {
using Bytes = std::vector<unsigned char>;
constexpr size_t MaxPacket = 65545;
struct Writer {
    Bytes bytes;
    Writer& raw(const void* value, size_t size) { if (size) { const auto* p = static_cast<const unsigned char*>(value); bytes.insert(bytes.end(), p, p + size); } return *this; }
    Writer& u8(unsigned char value) { return raw(&value, 1); }
    Writer& u16(unsigned short value) { return raw(&value, 2); }
    Writer& u32(DWORD value) { return raw(&value, 4); }
    Writer& guid(const GUID& value) { return raw(&value, 16); }
    Writer& text(const std::wstring& value) {
        if (value.size() > 65535) throw std::runtime_error("Name too long");
        return u16(static_cast<unsigned short>(value.size())).raw(value.data(), value.size() * 2);
    }
    Writer& blob(const Bytes& value) { return u32(static_cast<DWORD>(value.size())).raw(value.data(), value.size()); }
};
struct Reader {
    const Bytes& bytes; size_t offset = 0;
    explicit Reader(const Bytes& value) : bytes(value) {}
    void raw(void* output, size_t size) { if (size > bytes.size() - offset) throw std::runtime_error("Truncated server packet"); if (size) std::memcpy(output, bytes.data() + offset, size); offset += size; }
    unsigned char u8() { unsigned char value; raw(&value, 1); return value; }
    unsigned short u16() { unsigned short value; raw(&value, 2); return value; }
    DWORD u32() { DWORD value; raw(&value, 4); return value; }
    GUID guid() { GUID value; raw(&value, 16); return value; }
    std::wstring text(size_t limit = 128) { const size_t count = u16(); if (count > limit) throw std::runtime_error("Server name too long"); std::wstring value(count, L'\0'); raw(value.data(), count * 2); return value; }
    Bytes blob(size_t limit = 8192) { size_t count = u32(); if (count > limit) throw std::runtime_error("Server data too large"); Bytes value(count); raw(value.data(), count); return value; }
    Bytes rest() { Bytes result(bytes.size() - offset); raw(result.data(), result.size()); return result; }
    void end() { if (offset != bytes.size()) throw std::runtime_error("Unexpected server data"); }
};
inline std::wstring hex(const void* data, size_t count) {
    static const wchar_t* digits = L"0123456789abcdef";
    const auto* bytes = static_cast<const unsigned char*>(data); std::wstring result;
    for (size_t i = 0; i < count; ++i) { result += digits[bytes[i] >> 4]; result += digits[bytes[i] & 15]; }
    return result;
}
inline std::wstring urlEncode(const std::wstring& value) {
    const int count = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
    if (!count && !value.empty()) throw std::runtime_error("Invalid player name");
    std::string utf8(count, '\0');
    WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), utf8.data(), count, nullptr, nullptr);
    std::wstring result;
    for (unsigned char byte : utf8) {
        if ((byte >= 'a' && byte <= 'z') || (byte >= 'A' && byte <= 'Z') || (byte >= '0' && byte <= '9') || byte == '-' || byte == '_') result += static_cast<wchar_t>(byte);
        else { result += L'%'; result += hex(&byte, 1); }
    }
    return result;
}
}

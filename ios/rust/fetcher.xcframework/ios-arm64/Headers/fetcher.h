#pragma once

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    const char* key;
    const char* value;
} Header;

typedef struct {
    bool ok;
    int code;
    char* body;
} FetchResult;

FetchResult rust_fetch(const char* url, const Header* headers, int header_count);
void rust_free_string(char* ptr);

#ifdef __cplusplus
}
#endif

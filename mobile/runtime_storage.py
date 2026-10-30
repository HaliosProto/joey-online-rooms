"""Let optional BoxedWine caches fail without stopping a memory-only session."""

PATCHES = (
    ('return typeof indexedDB !== "undefined";',
     'try { return typeof indexedDB !== "undefined"; } catch (error) { return false; }'),
    ("var req = indexedDB.open('boxedwine-wasm-jit', 1);",
     """var req;
    try { req = indexedDB.open('boxedwine-wasm-jit', 1); }
    catch (error) {
        console.warn('[WASM JIT] IndexedDB unavailable, JIT cache disabled');
        done();
        return;
    }"""),
)


def tolerate_denied_storage(source):
    for old, new in PATCHES:
        if new in source:
            continue
        if source.count(old) != 1:
            raise ValueError('Unexpected BoxedWine optional-storage source')
        source = source.replace(old, new)
    return source

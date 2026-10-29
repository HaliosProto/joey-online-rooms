// Route touch through SDL's real input state and queue, as its mouse driver does.
// The older direct X11 entry points do not update all state used by DirectInput.
extern "C" int SDL_SendMouseMotion(SDL_Window*, Uint32, int, int, int);
extern "C" int SDL_SendMouseButton(SDL_Window*, Uint32, Uint8, Uint8);
static SDL_Window* joeyTouchWindow() {
    SDL_Window* window = SDL_GetKeyboardFocus();
    if (!window) window = SDL_GetMouseFocus();
    if (!window) window = SDL_GetWindowFromID(1);
    return window;
}
static void joeyTouchPosition(int x, int y) {
    KNativeScreenPtr screen = KNativeSystem::getScreen();
    if (screen) std::static_pointer_cast<KNativeInputSDL>(screen->getInput())->setEmscriptenMousePosition(x, y);
}
extern "C" EMSCRIPTEN_KEEPALIVE void joeyTouchMove(int x, int y) {
    joeyTouchPosition(x, y);
    SDL_Window* window = joeyTouchWindow();
    if (window) SDL_SendMouseMotion(window, 0, 0, x, y);
}
extern "C" EMSCRIPTEN_KEEPALIVE void joeyTouchButton(U32 down, U32 button, int x, int y) {
    joeyTouchPosition(x, y);
    SDL_Window* window = joeyTouchWindow();
    if (window) {
        SDL_SendMouseMotion(window, 0, 0, x, y);
        SDL_SendMouseButton(window, 0, down ? SDL_PRESSED : SDL_RELEASED, button == 1 ? SDL_BUTTON_RIGHT : SDL_BUTTON_LEFT);
    }
}

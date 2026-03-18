/**
 * Overlay entry point — thin wrapper that imports the real overlay app.
 * This file lives inside src/renderer/ so Vite can resolve it,
 * while the actual overlay code lives in src/overlay/.
 */
import '../overlay/src/main'

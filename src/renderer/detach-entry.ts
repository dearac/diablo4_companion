/**
 * Detach window entry point — imports the DetachApp from overlay.
 * This file lives inside src/renderer/ so Vite can resolve it,
 * while the actual detach code lives in src/overlay/.
 */
import '../overlay/src/detach-main'

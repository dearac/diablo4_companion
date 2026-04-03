# Diablo IV Companion v1.13.4

## What's Changed

- **Scan & Overlay Improvements**
  - **Geometric Target Alignment:** Fixed an issue where scan markers would dramatically shift to the left when hovering items near the bottom of your inventory due to background game UI text being parsed as an affix.
  - **Smart Manual Dismissal:** When you manually scan an item, the overlay now uses an intelligent mouse-tracker. The dots will persist perfectly until you move your mouse away from the tooltip, completely removing the old forced 6-second timeout.
  - **Autoscan Functionality:** Added an Autoscan feature with a UI toggle in the overlay controls, allowing real-time polling of your gear without pressing the hotkey.

**Full Commit Log:**

- `fix(overlay)`: geometric gear overlay alignment and auto-dismiss
- `feat(autoscan)`: implement autoscan feature with toggle in overlay

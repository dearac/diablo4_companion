/**
 * HotkeyService manages all keyboard shortcuts for the app.
 *
 * Every hotkey can be changed by the user in the Settings panel.
 * This service keeps track of what keys are assigned to what actions,
 * saves the user's preferences, and provides the current keybinding
 * for any action.
 *
 * Default hotkeys:
 *   F7  = Scan a gear tooltip (captures what's on screen)
 *   F8  = Open the Gear Report (shows results of all scans)
 *   F6  = Toggle the overlay on/off (hide or show the companion)
 */
export class HotkeyService {
  /** The factory-default keybindings — used when the user hasn't customized anything */
  private static readonly DEFAULTS: Record<string, string> = {
    scan: 'F7',
    report: 'F8',
    toggle: 'F6',
    detach: 'F9',
    boardScan: 'F10'
  }

  /**
   * The user's customized keybindings.
   * Only keys that the user has changed appear here.
   * If a key isn't in this map, we fall back to the default above.
   */
  private overrides: Record<string, string> = {}

  /** The electron-store instance for saving preferences (null in tests) */
  private store: any

  constructor(store: any) {
    this.store = store

    // Load any previously saved hotkey customizations
    if (store) {
      this.overrides = store.get('hotkeys', {})
    }
  }

  /**
   * Gets the current keybinding for an action.
   *
   * @param action - The action name: "scan", "report", or "toggle"
   * @returns The key like "F7", "F9", "Ctrl+Shift+S", etc.
   */
  getHotkey(action: string): string {
    // If the user customized this key, use their preference
    // Otherwise, use the built-in default
    return this.overrides[action] || HotkeyService.DEFAULTS[action]
  }

  /**
   * Changes the keybinding for an action.
   *
   * @param action - The action name: "scan", "report", or "toggle"
   * @param key - The new key, like "F9" or "Ctrl+Shift+G"
   */
  setHotkey(action: string, key: string): void {
    this.overrides[action] = key

    // Save to disk so the setting persists between app restarts
    if (this.store) {
      this.store.set('hotkeys', this.overrides)
    }
  }

  /**
   * Returns all current hotkeys as a simple object.
   * Useful for displaying in the Settings panel.
   */
  getAllHotkeys(): Record<string, string> {
    return {
      scan: this.getHotkey('scan'),
      report: this.getHotkey('report'),
      toggle: this.getHotkey('toggle'),
      detach: this.getHotkey('detach'),
      boardScan: this.getHotkey('boardScan')
    }
  }

  /**
   * Resets all hotkeys to factory defaults.
   * Clears any user customizations and persists the reset.
   */
  resetAll(): void {
    this.overrides = {}
    if (this.store) {
      this.store.set('hotkeys', {})
    }
  }

  /** Returns the factory-default keybindings */
  static getDefaults(): Record<string, string> {
    return { ...HotkeyService.DEFAULTS }
  }
}

# UI Overhaul Implementation Plan

> **For Antigravity:** REQUIRED SUB-SKILL: Load executing-plans to implement this plan task-by-task.

**Goal:** Merge the two-window Electron architecture into a single always-on-top window with a Maxroll-inspired dark theme, 6 dedicated tabs, 2-column gear grid, two-panel scan comparison with manual affix editing, and audio scan feedback.

**Architecture:** Single `mainWindow` replaces both `configWindow` and `overlayWindow`. All overlay components absorbed into `src/renderer/`. New IPC for always-on-top toggle and audio feedback. Paragon board detach window unchanged.

**Tech Stack:** Electron, React, TypeScript, CSS Variables, Vitest

---

### Task 1: Apply Maxroll Color Palette to Design Tokens

**Files:**
- Modify: `src/renderer/src/assets/base.css`

**Step 1: Write the minimal implementation**
Replace all existing CSS custom properties in `base.css` with the Maxroll-inspired palette. Replace the Google Fonts import to use Inter only (drop Cinzel).

```css
/* ============================================================
   DIABLO IV COMPANION — Design Tokens
   ============================================================
   Maxroll-inspired dark theme.
   Clean charcoal base, blue accent, game-accurate rarity colors.
   ============================================================ */

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

:root {
  /* Backgrounds */
  --bg-dark: #0A0A0A;
  --bg-surface: #121212;
  --bg-elevated: #1A1A1A;
  --bg-input: #0E0E0E;

  /* Primary accent */
  --accent-blue: #057AF0;
  --accent-blue-dim: rgba(5, 122, 240, 0.15);
  --accent-blue-hover: #0A8FFF;

  /* Text */
  --text-primary: #E8E8E8;
  --text-heading: #FFFFFF;
  --text-muted: #95989B;
  --text-dim: #4A4A4A;

  /* Borders */
  --border: #2A2A2A;
  --border-hover: #3A3A3A;
  --border-focus: #057AF0;

  /* Item rarity (Maxroll-accurate) */
  --item-unique: #DCA779;
  --item-legendary: #BF642F;
  --item-rare: #FFFF00;
  --item-magic: #6699FF;
  --item-greater: #AF67F2;

  /* Feedback */
  --success: #4ADE80;
  --error: #EF4444;
  --warning: #FBBF24;

  /* Typography */
  --font-display: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-body: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
}

*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--font-body);
  color: var(--text-primary);
  background: var(--bg-dark);
  line-height: 1.6;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}
```

**Step 2: Commit**
```bash
git add src/renderer/src/assets/base.css
git commit -m "style: replace gothic tokens with Maxroll-inspired palette"
```

---

### Task 2: Rewrite main.css — Global Layout, Tabs, and Component Styles

**Files:**
- Modify: `src/renderer/src/assets/main.css`

This is the largest single task. The entire 1915-line CSS file is rewritten to use the new tokens and class names. Key changes:
- All `var(--d4-*)` references → new `var(--*)` tokens
- Gothic ornate borders → clean flat borders
- Red/gold accent colors → blue accent
- New tab bar styles (`.app-tabs`)
- New gear grid styles (`.gear-grid`, `.gear-card`)
- New scans two-panel styles (`.scans-split`, `.scan-inbox`, `.scan-detail`)
- New settings tab styles
- Preserve paragon canvas styles unchanged (only update token references)

**Step 1: Write the minimal implementation**

Replace the entire `main.css`. This is too long to include inline — the full replacement will be written during execution. Key structural CSS blocks to include:

```css
/* ---- App Shell ---- */
.app-shell { /* flex column, min-height 100vh */ }
.app-header { /* title bar + build name */ }
.app-tabs { /* horizontal tab bar, blue active underline */ }
.app-tabs__tab--active { border-bottom-color: var(--accent-blue); color: var(--text-heading); }
.app-main { /* main content area, flex: 1 */ }

/* ---- Gear Grid ---- */
.gear-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.gear-card { /* surface card with left border color-coded by match % */ }
.gear-card__header { /* slot name + match % badge */ }
.gear-card__affixes { /* affix list with match/miss indicators */ }
.gear-card__edit-btn { /* pencil icon to open inline editing */ }

/* ---- Scans Two-Panel ---- */
.scans-split { display: grid; grid-template-columns: 280px 1fr; gap: 16px; height: 100%; }
.scan-inbox { /* scrollable list of scan entries */ }
.scan-inbox__item { /* compact row: slot, verdict badge, time */ }
.scan-inbox__item--active { border-left-color: var(--accent-blue); background: var(--accent-blue-dim); }
.scan-detail { /* side-by-side comparison area */ }
.scan-comparison { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.scan-card { /* individual build-req or scanned-gear card */ }

/* ---- Settings ---- */
.settings-panel { /* hotkey rows, cache buttons */ }

/* ---- Shared ---- */
.affix-editor { /* inline dropdown for affix type reclassification */ }
.affix-editor__select { /* small dropdown: Regular | Tempered | Greater | Implicit */ }

/* ---- Paragon (UNCHANGED except token refs) ---- */
/* Keep all .paragon-canvas-* rules, just replace --d4-* with --* */
```

**Step 2: Commit**
```bash
git add src/renderer/src/assets/main.css
git commit -m "style: rewrite main.css with Maxroll theme and new layout classes"
```

---

### Task 3: Remove Overlay Window and Clean Up Main Process

**Files:**
- Modify: `src/main/index.ts`
- Modify: `electron.vite.config.ts`
- Delete: `src/renderer/overlay.html`
- Delete: `src/overlay/` (entire directory)

**Step 1: Write the minimal implementation**

In `src/main/index.ts`:

1. Remove `overlayWindow` variable and `createOverlayWindow()` function (lines 80-235)
2. Rename `configWindow` to `mainWindow` throughout
3. Remove these IPC handlers from `setupIpcHandlers()`:
   - `set-ignore-mouse-events` (line 515-519)
   - `launch-overlay` (line 600-602)
   - `overlay-ready` (line 605-609)
   - `close-overlay` (line 612-617)
   - `open-config` (line 620-625)
4. Update hotkey handlers in `registerGlobalHotkeys()`:
   - **toggle**: Change from show/hide `overlayWindow` to toggle `mainWindow.setAlwaysOnTop()`
   - **scan**: Send `scan-result` to `mainWindow` instead of `overlayWindow`
   - **report**: Send `trigger-report` to `mainWindow` instead of `overlayWindow`
   - **boardScan**: Send `board-scan-result` to `mainWindow` instead of `overlayWindow`
5. Push hotkey status to `mainWindow` only (line 948, remove overlayWindow push)
6. Update `app.whenReady()`: Only call `createMainWindow()` (was `createConfigWindow()`)

Toggle hotkey handler becomes:
```typescript
if (hotkeys.toggle) {
  const ok = globalShortcut.register(hotkeys.toggle, () => {
    if (!mainWindow) return
    const isOnTop = mainWindow.isAlwaysOnTop()
    mainWindow.setAlwaysOnTop(!isOnTop, isOnTop ? undefined : 'screen-saver')
    console.log(`[Hotkeys] Always-on-top: ${!isOnTop}`)
  })
  status.toggle = ok
}
```

Scan hotkey handler becomes:
```typescript
if (hotkeys.scan) {
  const ok = globalShortcut.register(hotkeys.scan, async () => {
    if (!mainWindow) return
    try {
      const result = await scanService.scan(currentBuildData)
      mainWindow.webContents.send('scan-result', result)
    } catch (err) {
      mainWindow.webContents.send('scan-result', {
        mode: scanService.getScanMode(),
        verdict: null,
        equippedItem: null,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  })
  status.scan = ok
}
```

In `electron.vite.config.ts`, remove the `overlay` entry point and `@overlay` alias:
```typescript
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    server: {
      fs: {
        allow: [
          resolve('src/renderer'),
          resolve('src/shared'),
          resolve('node_modules')
        ]
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          detach: resolve(__dirname, 'src/renderer/detach.html')
        }
      }
    }
  }
})
```

Delete `src/renderer/overlay.html` and the entire `src/overlay/` directory.

**Step 2: Commit**
```bash
git add -A
git commit -m "refactor: remove overlay window, rename configWindow to mainWindow"
```

---

### Task 4: Clean Up Preload — Remove Overlay-Only IPC

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

**Step 1: Write the minimal implementation**

Remove these methods from the `api` object in `src/preload/index.ts`:
- `setIgnoreMouseEvents` (lines 42-44) — no click-through needed
- `launchOverlay` (lines 131-133) — no overlay to launch
- `overlayReady` (lines 138-140) — no overlay handshake
- `onBuildData` (lines 145-147) — build data lives in renderer state now
- `closeOverlay` (lines 152-154) — no overlay to close
- `openConfig` (lines 159-161) — no separate config window

Add new IPC method for always-on-top toggle:
```typescript
/** Toggles always-on-top mode on the main window. */
toggleAlwaysOnTop: (): void => {
  ipcRenderer.send('toggle-always-on-top')
},

/** Listens for always-on-top state changes. */
onAlwaysOnTopChanged: (callback: (isOnTop: boolean) => void): void => {
  ipcRenderer.on('always-on-top-changed', (_event, isOnTop) => callback(isOnTop))
},
```

Mirror the same removals and additions in `src/preload/index.d.ts`.

**Step 2: Commit**
```bash
git add src/preload/index.ts src/preload/index.d.ts
git commit -m "refactor: clean up preload, remove overlay IPC, add always-on-top toggle"
```

---

### Task 5: Absorb Overlay Components into Renderer

**Files:**
- Move: `src/overlay/src/components/SkillsPanel.tsx` → `src/renderer/src/components/SkillsPanel.tsx`
- Move: `src/overlay/src/components/ParagonPanel.tsx` → `src/renderer/src/components/ParagonPanel.tsx`
- Move: `src/overlay/src/components/ParagonBoardCanvas.tsx` → `src/renderer/src/components/ParagonBoardCanvas.tsx`
- Move: `src/overlay/src/components/ScanControls.tsx` → `src/renderer/src/components/ScanControls.tsx`

**Note:** If `src/overlay/` was already deleted in Task 3, these files should be recovered from git history first using `git checkout HEAD~1 -- src/overlay/src/components/SkillsPanel.tsx` etc., OR Task 3 and Task 5 should be done in the correct order (copy first, then delete).

> **IMPORTANT:** During execution, do Task 5 BEFORE the delete step of Task 3. Copy the files first, then delete the overlay directory.

**Step 1: Write the minimal implementation**

Copy each file, updating only the import paths:
- Change `'../../../shared/types'` → `'../../../shared/types'` (same relative path from renderer/src/components)

For `ParagonPanel.tsx`, update the local import:
```typescript
import ParagonBoardCanvas from './ParagonBoardCanvas'
```
(No change needed — same directory after move.)

For `ScanControls.tsx`, imports stay the same — it only imports from `shared/types`.

**Step 2: Commit**
```bash
git add src/renderer/src/components/SkillsPanel.tsx
git add src/renderer/src/components/ParagonPanel.tsx
git add src/renderer/src/components/ParagonBoardCanvas.tsx
git add src/renderer/src/components/ScanControls.tsx
git commit -m "refactor: absorb overlay components into renderer"
```

---

### Task 6: Rewrite App.tsx — 6-Tab Layout with Build State

**Files:**
- Modify: `src/renderer/src/App.tsx`

**Step 1: Write the minimal implementation**

Rewrite `App.tsx` to:
1. Add `MainTab` type: `'builds' | 'gear' | 'skills' | 'paragon' | 'scans' | 'settings'`
2. Default active tab to `'builds'`
3. Add state from overlay: `scanHistory`, `equippedGear`, `scanResult`
4. Listen for `onScanResult` IPC — update scans, play audio, auto-switch to scans tab
5. Listen for `onTriggerReport` IPC — toggle always-on-top
6. Remove "Launch Overlay" button
7. Render 6 tabs in the tab bar
8. Render tab content: `BuildsTab`, `GearTab`, `SkillsPanel`, `ParagonPanel`, `ScansTab`, `SettingsTab`

```tsx
type MainTab = 'builds' | 'gear' | 'skills' | 'paragon' | 'scans' | 'settings'

const TAB_LABELS: { id: MainTab; label: string }[] = [
  { id: 'builds', label: 'Builds' },
  { id: 'gear', label: 'Gear' },
  { id: 'skills', label: 'Skills' },
  { id: 'paragon', label: 'Paragon' },
  { id: 'scans', label: 'Scans' },
  { id: 'settings', label: 'Settings' }
]
```

Tab bar rendered as:
```tsx
<nav className="app-tabs" id="main-tab-bar">
  {TAB_LABELS.map((tab) => (
    <button
      key={tab.id}
      className={`app-tabs__tab ${activeTab === tab.id ? 'app-tabs__tab--active' : ''}`}
      onClick={() => setActiveTab(tab.id)}
    >
      {tab.label}
    </button>
  ))}
</nav>
```

Scan result listener with audio:
```tsx
useEffect(() => {
  window.api.onScanResult((result) => {
    // Play success/error audio
    const sound = new Audio(result.error ? '/sounds/error.wav' : '/sounds/success.wav')
    sound.play().catch(() => {})

    // Update scan history
    if (result.mode === 'compare' && result.verdict) {
      window.api.getScanHistory().then(setScanHistory)
    }
    if (result.mode === 'equip' && result.equippedItem) {
      window.api.getEquippedGear().then(setEquippedGear)
    }

    // Auto-switch to scans tab
    setActiveTab('scans')
    setLatestScanResult(result)
  })
}, [])
```

**Step 2: Commit**
```bash
git add src/renderer/src/App.tsx
git commit -m "feat: rewrite App.tsx with 6-tab layout and scan audio feedback"
```

---

### Task 7: Build GearTab Component — 2-Column Fixed Grid

**Files:**
- Create: `src/renderer/src/components/GearTab.tsx`

**Step 1: Write the minimal implementation**

Create `GearTab.tsx` merging logic from `EquippedGearTab.tsx` (renderer) and `GearPanel.tsx` (overlay) into a 2-column fixed grid.

```tsx
const LEFT_COLUMN = ['Helm', 'Chest Armor', 'Gloves', 'Pants', 'Boots']
const RIGHT_COLUMN = ['Amulet', 'Ring 1', 'Ring 2', 'Weapon', 'Offhand']
```

Props:
```tsx
interface GearTabProps {
  buildData: RawBuildData | null
}
```

Each gear card shows:
- Slot name
- Item name + power (if equipped)
- Match percentage badge (color-coded)
- Affix match/miss list
- Aspect comparison
- Action hints (enchant, temper, imprint)
- Edit button for manual affix reclassification
- Re-evaluate button

The affix editing state is managed per-card:
```tsx
const [editingSlot, setEditingSlot] = useState<string | null>(null)
const [editedGear, setEditedGear] = useState<Record<string, ScannedGearPiece>>({})
```

When a user edits affix types, it updates `editedGear[slotName]` with the reclassified affixes. "Re-evaluate" just uses the edited version for comparison display.

**Step 2: Commit**
```bash
git add src/renderer/src/components/GearTab.tsx
git commit -m "feat: add GearTab with 2-column grid and affix editing"
```

---

### Task 8: Build ScansTab Component — Two-Panel Split

**Files:**
- Create: `src/renderer/src/components/ScansTab.tsx`

**Step 1: Write the minimal implementation**

Create `ScansTab.tsx` with two-panel split layout:

Props:
```tsx
interface ScansTabProps {
  scanHistory: ScanHistoryEntry[]
  buildData: RawBuildData | null
  latestScanResult: ScanResult | null
  onClearHistory: () => void
}
```

Left panel — scan inbox:
```tsx
<div className="scan-inbox">
  {scanHistory.map((entry, index) => (
    <div
      key={entry.scannedAt}
      className={`scan-inbox__item ${selectedIndex === index ? 'scan-inbox__item--active' : ''}`}
      onClick={() => setSelectedIndex(index)}
    >
      <span className="scan-inbox__slot">{entry.verdict.scannedItem.slot}</span>
      <span className={`scan-inbox__verdict scan-inbox__verdict--${entry.verdict.verdict.toLowerCase()}`}>
        {VERDICT_ICONS[entry.verdict.verdict]} {entry.verdict.verdict}
      </span>
      <span className="scan-inbox__time">{formatRelativeTime(entry.scannedAt)}</span>
    </div>
  ))}
</div>
```

Right panel — side-by-side comparison:
```tsx
<div className="scan-detail">
  <div className="scan-comparison">
    <div className="scan-card scan-card--build">
      <h3>Build Requirements</h3>
      {/* Render buildSlot affixes, aspect, tempered, etc. */}
    </div>
    <div className="scan-card scan-card--scanned">
      <h3>Scanned Gear</h3>
      {/* Render scanned item with edit buttons */}
    </div>
  </div>
  <div className="scan-verdict">
    {/* Verdict badge, recommendations, actions */}
  </div>
  <div className="scan-actions">
    <button onClick={handleEditAffixes}>✏️ Edit Affixes</button>
    <button onClick={handleReEvaluate}>🔄 Re-evaluate</button>
  </div>
</div>
```

Auto-select the most recent scan when `latestScanResult` changes.

**Step 2: Commit**
```bash
git add src/renderer/src/components/ScansTab.tsx
git commit -m "feat: add ScansTab with two-panel split and affix editing"
```

---

### Task 9: Build SettingsTab Component

**Files:**
- Create: `src/renderer/src/components/SettingsTab.tsx`

**Step 1: Write the minimal implementation**

Extract hotkey settings from `HotkeySettings.tsx` and add cache/calibration controls currently in the footer.

```tsx
function SettingsTab(): React.JSX.Element {
  // Reuse all logic from HotkeySettings.tsx
  // Add the cache/calibration buttons from App.tsx footer

  return (
    <div className="settings-panel">
      <section className="settings-section">
        <h2 className="settings-section__title">Hotkeys</h2>
        {/* Hotkey binding rows — same as current HotkeySettings */}
      </section>

      <section className="settings-section">
        <h2 className="settings-section__title">Overlay Mode</h2>
        <p className="settings-section__desc">
          Press the Toggle hotkey to keep this window always-on-top of your game.
        </p>
        {/* Always-on-top status indicator */}
      </section>

      <section className="settings-section">
        <h2 className="settings-section__title">Maintenance</h2>
        <button onClick={handleClearCache}>🔄 Clear Board Cache</button>
        <button onClick={handleClearCalibration}>📐 Reset Calibration</button>
      </section>

      <section className="settings-section">
        <h2 className="settings-section__title">Scan Mode</h2>
        {/* ScanControls component (Compare vs Equip toggle) */}
      </section>
    </div>
  )
}
```

**Step 2: Commit**
```bash
git add src/renderer/src/components/SettingsTab.tsx
git commit -m "feat: add SettingsTab with hotkeys, scan mode, and maintenance"
```

---

### Task 10: Add Audio Scan Feedback

**Files:**
- Create: `src/renderer/src/assets/sounds/shutter.wav`
- Create: `src/renderer/src/assets/sounds/success.wav`
- Create: `src/renderer/src/assets/sounds/error.wav`

**Step 1: Write the minimal implementation**

Source short, royalty-free WAV files:
- **shutter.wav** — camera click sound, ~0.3s
- **success.wav** — clean chime/ding, ~0.5s
- **error.wav** — soft descending tone, ~0.5s

These can be generated or sourced from Windows system sounds:
- Success: `C:\Windows\Media\chimes.wav` (copy and rename)
- Error: `C:\Windows\Media\chord.wav` (copy and rename)
- Shutter: Will need a bundled sample or a simple Web Audio API click

Alternative: Use Web Audio API to synthesize sounds programmatically:
```typescript
/** Plays a short click sound for scan initiation */
function playShutterSound(): void {
  const ctx = new AudioContext()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.frequency.value = 1000
  gain.gain.setValueAtTime(0.3, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + 0.08)
}

/** Plays a pleasant chime for scan success */
function playSuccessSound(): void {
  const ctx = new AudioContext()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.frequency.value = 880
  osc.type = 'sine'
  gain.gain.setValueAtTime(0.2, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + 0.4)
}

/** Plays a soft error tone */
function playErrorSound(): void {
  const ctx = new AudioContext()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.frequency.value = 300
  osc.type = 'sine'
  gain.gain.setValueAtTime(0.2, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + 0.3)
}
```

Create `src/renderer/src/utils/audio.ts` with these functions.

Integration point in `App.tsx`:
```typescript
import { playShutterSound, playSuccessSound, playErrorSound } from './utils/audio'

// In the scan hotkey listener (main process side) — send 'scan-started' event
// In the renderer onScanResult callback:
useEffect(() => {
  window.api.onScanResult((result) => {
    if (result.error) {
      playErrorSound()
    } else {
      playSuccessSound()
    }
    // ... rest of handler
  })
}, [])
```

For shutter sound on scan initiation, add a new IPC event `scan-started`:
- **Main process** (`index.ts`): In the scan hotkey handler, send `mainWindow.webContents.send('scan-started')` before calling `scanService.scan()`
- **Preload** (`index.ts`): Add `onScanStarted` listener
- **Renderer** (`App.tsx`): Listen and play shutter sound

**Step 2: Commit**
```bash
git add src/renderer/src/utils/audio.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "feat: add audio feedback for scan events"
```

---

### Task 11: Wire Always-On-Top Toggle IPC

**Files:**
- Modify: `src/main/index.ts`

**Step 1: Write the minimal implementation**

Add new IPC handler in `setupIpcHandlers()`:
```typescript
// Toggle always-on-top mode
ipcMain.on('toggle-always-on-top', () => {
  if (!mainWindow) return
  const isOnTop = mainWindow.isAlwaysOnTop()
  mainWindow.setAlwaysOnTop(!isOnTop, isOnTop ? undefined : 'screen-saver')
  mainWindow.webContents.send('always-on-top-changed', !isOnTop)
  console.log(`[Overlay] Always-on-top: ${!isOnTop}`)
})
```

The toggle hotkey in `registerGlobalHotkeys()` also sends this state change to the renderer (already handled in Task 3).

**Step 2: Commit**
```bash
git add src/main/index.ts
git commit -m "feat: add always-on-top toggle IPC handler"
```

---

### Task 12: Delete Old Components and Clean Up

**Files:**
- Delete: `src/renderer/src/components/EquippedGearTab.tsx` (replaced by GearTab)
- Delete: `src/renderer/src/components/ScanHistoryTab.tsx` (replaced by ScansTab)
- Delete: `src/renderer/src/components/HotkeySettings.tsx` (absorbed into SettingsTab)
- Modify: `src/renderer/src/App.tsx` (remove old component imports)

**Step 1: Write the minimal implementation**
Delete the three old component files. Update App.tsx to remove their imports and any references.

**Step 2: Commit**
```bash
git add -A
git commit -m "chore: delete replaced components (EquippedGearTab, ScanHistoryTab, HotkeySettings)"
```

---

### Task 13: UI Verification

**Files:**
- Test: Manual Visual Verification

**Step 1: Run the dev server**
```bash
npm run dev
```
Expected: The app opens as a single window with the Maxroll dark theme.

**Step 2: Verify each tab**
1. **Builds tab** — Import a build URL, verify it loads. Library shows saved builds. No "Launch Overlay" button.
2. **Gear tab** — Shows 2-column grid (5 rows). Left: Helm through Boots. Right: Amulet through Offhand. Cards show match %. Edit button works.
3. **Skills tab** — Shows build skills grouped by tier.
4. **Paragon tab** — Shows interactive paragon board canvas. Zoom/pan works. Detach button works.
5. **Scans tab** — Two-panel split. Left is empty or shows history. Right shows side-by-side comparison when selecting a scan.
6. **Settings tab** — Shows hotkey bindings, scan mode toggle, cache/calibration buttons.

**Step 3: Verify always-on-top toggle**
Press the toggle hotkey (default F6). Verify the window stays on top. Press again to turn off.

**Step 4: Verify scan audio + auto-switch**
Press the scan hotkey (default F7). Verify:
- Camera shutter sound plays
- Success/error sound plays when scan completes
- App auto-switches to Scans tab
- New scan appears in inbox, auto-selected

**Step 5: Verify paragon detach is unchanged**
Click detach button on Paragon tab. Verify separate transparent overlay window opens as before.

**Step 6: Run existing tests**
```bash
npm run test:unit
```
Expected: All 13 existing unit tests pass (services are unchanged).

**Step 7: Commit**
```bash
git commit --allow-empty -m "test: verified UI overhaul - all tabs, audio, always-on-top"
```

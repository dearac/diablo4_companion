# UI Overhaul Design — Single Window + Maxroll Theme

> **Branch:** `experimental/ui-overhaul`
> **Date:** 2026-03-24

## Goal

Merge the two-window Electron architecture (config + overlay) into a **single always-on-top window** with a complete Maxroll-inspired visual redesign. Replace the gothic red/gold theme with a clean dark theme, reorganize all content into **6 dedicated tabs**, introduce a **2-column fixed gear grid**, add **side-by-side scan comparisons** with manual affix editing, and replace visual scan notifications with **audio feedback**.

## Constraints

- **Paragon board visuals and functionality must NOT change** — canvas rendering, detach overlay, calibration all stay as-is
- Experimental branch — merge to master only after validation

---

## 1. Architecture — Single Window with Overlay Mode

**Current:** Two Electron windows (`configWindow` 1280×800 + `overlayWindow` transparent fullscreen) with separate codebases, HTML entry points, and component trees.

**New:**
- **One window** (`mainWindow`) — starts as a normal 1280×800 desktop window
- **Toggle hotkey** switches between:
  - **Normal mode** — standard desktop window, taskbar visible, normal z-order
  - **Overlay mode** — `alwaysOnTop: true` at `'screen-saver'` level, stays above fullscreen games
- **Delete `src/overlay/` entirely** — all overlay components absorbed into `src/renderer/`
- Overlay drag/resize/click-through logic is **removed**
- Detach window for paragon boards stays unchanged

**Eliminated code:**
- `createOverlayWindow()` function in `main/index.ts`
- `overlay-ready`, `launch-overlay`, `close-overlay` IPC handlers
- `set-ignore-mouse-events` IPC (no click-through)
- "Launch Overlay" button in Builds tab
- Separate overlay HTML entry point (`overlay.html`)
- Entire `src/overlay/` directory (11 components, 2 entry points, CSS)

---

## 2. Tab Structure

Six dedicated tabs, each gets the full app content area:

| Tab | Content | Source |
|-----|---------|--------|
| **Builds** | Import form + build library (load/delete) | Existing `renderer` |
| **Gear** | 2-column fixed grid with match comparison | Merge of `EquippedGearTab` + overlay `GearPanel` |
| **Skills** | Build skill list | Absorb overlay `SkillsPanel` |
| **Paragon** | Interactive board canvas + detach | Absorb overlay `ParagonPanel` (visuals unchanged) |
| **Scans** | Two-panel split: inbox + side-by-side detail | New design (replaces `ScanHistoryTab` + `VerdictCard`) |
| **Settings** | Hotkey bindings, cache clear, calibration reset | Promote from footer/collapsible section |

Tab bar: full-width horizontal buttons, active tab highlighted with blue (`#057AF0`) underline indicator.

---

## 3. Gear Tab — 2-Column Fixed Grid

```
┌─────────────────────────┬─────────────────────────┐
│        HELM             │       AMULET            │
│  Deathless Visage       │  Tyrant's Amulet        │
│  925 iP · ✅ 4/4        │  925 iP · 🟡 2/4        │
├─────────────────────────┼─────────────────────────┤
│      CHEST ARMOR        │       RING 1            │
│  Runic Mail             │  Band of Starfall       │
│  925 iP · ✅ 3/3        │  925 iP · 🔴 1/4        │
├─────────────────────────┼─────────────────────────┤
│       GLOVES            │       RING 2            │
│  Gauntlets of Fury      │  Ring of Mendeln        │
│  925 iP · 🟢 3/4        │  925 iP · ✅ 4/4        │
├─────────────────────────┼─────────────────────────┤
│        PANTS            │       WEAPON            │
│  Boneweave Leggings     │  Doombringer            │
│  925 iP · 🟡 2/4        │  925 iP · 🔴 1/5        │
├─────────────────────────┼─────────────────────────┤
│        BOOTS            │      OFFHAND            │
│  Boneweave Treads       │  ...                    │
│  925 iP · ✅ 4/4        │  Not scanned            │
└─────────────────────────┴─────────────────────────┘
```

- Left column: Helm, Chest, Gloves, Pants, Boots
- Right column: Amulet, Ring 1, Ring 2, Weapon, Offhand
- Each card shows: item name, item power, build match %, action hints
- Hover/click reveals full affix comparison tooltip
- Manual affix editing available via edit button on each card
- `[✏️ Edit]` button opens inline affix reclassification
- `[🔄 Re-evaluate]` button re-runs comparison with user corrections

---

## 4. Scans Tab — Two-Panel Split

```
┌───────────────────────┬──────────────────────────────────────────┐
│  SCAN INBOX           │  COMPARISON DETAIL                       │
│  (scrollable list)    │                                          │
│                       │  ┌────────────┐  ┌────────────────┐      │
│  ▸ Helm · ⬆ UP · 2m  │  │ BUILD REQS │  │ SCANNED GEAR   │      │
│  ▸ Chest · ✅ · 5m    │  │            │  │                │      │
│  ▸ Ring 1 · ⬇ · 8m   │  │ Aspect: X  │  │ Ancestral      │      │
│  ▸ Boots · 🟡 · 12m  │  │ Affixes:   │  │ 925 iP         │      │
│                       │  │  • +Ranks  │  │  ✅ +Ranks     │      │
│  [Clear All]          │  │  • Crit    │  │  ❌ Crit       │      │
│                       │  │ Tempered:  │  │  ✅ Bash DMG   │      │
│                       │  │  • Bash    │  │                │      │
│                       │  └────────────┘  └────────────────┘      │
│                       │                                          │
│                       │  VERDICT: UPGRADE (3/4)                  │
│                       │  🔧 Enchant: Reroll X → Crit DMG        │
│                       │                                          │
│                       │  [✏️ Edit Affixes]  [🔄 Re-evaluate]     │
└───────────────────────┴──────────────────────────────────────────┘
```

- **Left panel**: Compact scan entries — slot, verdict badge, relative time. Latest on top. Click to select.
- **Right panel**: Full side-by-side comparison for selected scan. Build requirements on left, scanned gear on right
- **Edit Affixes**: Inline editing — dropdowns to reclassify any affix as regular/tempered/greater/implicit
- **Re-evaluate**: Re-runs comparison logic with user corrections, updates verdict in place
- **Real-time updates**: New scans appear instantly via IPC push, auto-selected
- When a new scan arrives, the Scans tab is set as the active tab (so toggling the app shows results immediately)

---

## 5. Audio Scan Feedback

| Event | Sound |
|-------|-------|
| Scan initiated | Camera shutter click |
| Scan success | Clean chime/ding |
| Scan error | Soft error tone |

- No visual popup/toast — audio only
- Sounds played via `new Audio()` in renderer with bundled WAV files in `src/renderer/src/assets/sounds/`
- Scans tab auto-activates on new scan result

---

## 6. Color Palette — Maxroll-Inspired

```css
:root {
  /* Backgrounds */
  --bg-dark:        #0A0A0A;
  --bg-surface:     #121212;
  --bg-elevated:    #1A1A1A;
  --bg-input:       #0E0E0E;

  /* Primary accent */
  --accent-blue:    #057AF0;
  --accent-blue-dim: rgba(5, 122, 240, 0.15);

  /* Text */
  --text-primary:   #E8E8E8;
  --text-heading:   #FFFFFF;
  --text-muted:     #95989B;
  --text-dim:       #4A4A4A;

  /* Borders */
  --border:         #2A2A2A;
  --border-hover:   #3A3A3A;

  /* Item rarity (Maxroll-accurate) */
  --item-unique:    #DCA779;
  --item-legendary: #BF642F;
  --item-rare:      #FFFF00;
  --item-magic:     #6699FF;
  --item-greater:   #AF67F2;

  /* Feedback */
  --success:        #4ADE80;
  --error:          #EF4444;
  --warning:        #FBBF24;

  /* Typography */
  --font-display:   'Inter', sans-serif;
  --font-body:      'Inter', sans-serif;
}
```

- All `--d4-*` token names replaced with clean semantic names
- No more gothic Cinzel font — Inter only
- No ornate borders or red/gold accents
- Blue as the primary interactive color
- Item rarity colors match Maxroll/in-game conventions

---

## 7. Components to Absorb from Overlay

These overlay components move into `src/renderer/src/components/`:

| Overlay Component | Action |
|---|---|
| `SkillsPanel.tsx` | Move as-is, update imports |
| `ParagonPanel.tsx` | Move as-is, update imports |
| `ParagonBoardCanvas.tsx` | Move as-is (visuals unchanged) |
| `GearPanel.tsx` | Merge into new `GearTab.tsx` with 2-column grid |
| `ScansPanel.tsx` | Replace with new two-panel `ScansTab.tsx` |
| `VerdictCard.tsx` | Delete (replaced by audio + scans tab) |
| `ScanControls.tsx` | Absorb scan mode toggle into Settings or Scans tab |
| `OverlayHeader.tsx` | Delete (not needed) |
| `OverlayFooter.tsx` | Delete (not needed) |
| `TabBar.tsx` | Delete (replaced by new main tab bar) |
| `DetachToolbar.tsx` | Keep (used by detach window, unchanged) |

---

## 8. Manual Affix Editing — UX Flow

1. User scans gear → OCR produces affix list with auto-classifications
2. Some affixes may be misclassified (e.g., greater marked as regular, implicit missed)
3. User clicks **[✏️ Edit Affixes]** on either a scan card or equipped gear card
4. Each affix shows a small dropdown/toggle: `Regular | Tempered | Greater | Implicit`
5. User reclassifies as needed
6. User clicks **[🔄 Re-evaluate]** — comparison logic re-runs with corrected data
7. Updated verdict and recommendations replace the old ones
8. Corrections are persisted so they survive app restart

---

## 9. Files Deleted

- `src/overlay/` — entire directory
- `overlay.html` entry point
- All overlay-specific CSS
- `VerdictCard` component and CSS
- "Launch Overlay" button and related IPC

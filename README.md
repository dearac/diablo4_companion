# Diablo IV Companion

A desktop companion app for Diablo IV that imports builds from popular build sites and displays them as a transparent in-game overlay. Built with **Electron**, **React**, **TypeScript**, and **Playwright**.

---

## ✨ Features

### 🔗 Build Import — Paste a URL, Get Your Build

Import complete build data from any of the three major Diablo IV build sites:

| Site | Skills | Paragon | Gear |
|------|--------|---------|------|
| [d4builds.gg](https://d4builds.gg) | ✅ | ✅ (with spatial layout) | ✅ |
| [maxroll.gg](https://maxroll.gg) | ✅ | ✅ | ✅ |
| [icy-veins.com](https://icy-veins.com) | ✅ | ✅ | ✅ |

Each scraper uses **Playwright** to launch a headless Chromium browser, navigate to the build page, and extract structured data — skills, paragon boards, gear slots, and all associated stats.

### 🗺️ Interactive Paragon Board Viewer

- **2D spatial grid layout** — boards are positioned to match d4builds.gg's actual layout (not just a list)
- **Per-board rotation** — each board renders at its correct rotation (0°, 90°, 180°, 270°)
- **Zoom & pan** — mouse wheel zoom with cursor-anchoring + click-and-drag pan
- **SVG connection lines** — golden connecting lines between boards with layered glow effect
- **Node-level detail** — every tile shows its icon, background color by node type (Normal, Magic, Rare, Legendary, Glyph)
- **Hover tooltips** — mouse over any node to see its name, type, and stats
- **Layout fallback** — builds from non-d4builds sources use an automatic linear chain layout

### 💾 Build Library

- **Save builds** locally with one click after import
- **Load** any saved build instantly (no re-scraping needed)
- **Delete** builds you no longer need
- **Persistent storage** — builds saved as JSON in a portable `data/builds/` directory

### ⚡ Paragon Cache

- Board layouts and tooltip data are cached locally after first scrape
- Subsequent imports of builds with the same boards skip the expensive layout scrape
- **Clear cache** button in the UI for when game patches change board structures
- Cache stored at `data/classes/paragon_cache.json`

### 🎮 In-Game Overlay

- **Transparent** — see the game through the overlay
- **Frameless** — no title bar or window chrome
- **Always on top** — stays above the game at "screen-saver" level
- **Click-through** — mouse clicks pass through to the game by default
- **Full-screen** — covers the entire primary monitor
- **Tabbed interface** — switch between Skills, Paragon, and Gear panels
- **Global hotkeys** — toggle overlay and click-through without alt-tabbing

### 🛡️ Process Safety

- **ProcessManager** singleton tracks all Playwright browser instances by PID
- On app quit: gracefully closes all active browsers
- On app launch: detects and kills orphaned Chromium processes from previous crashes
- PID file tracking at `data/active-pids.json`

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Electron Main Process                  │
│                                                             │
│  ┌──────────────┐  ┌────────────────┐  ┌────────────────┐  │
│  │ BuildImport  │  │ BuildRepository│  │ ParagonCache   │  │
│  │ Service      │  │ (save/load)    │  │ Service        │  │
│  └──────┬───────┘  └────────────────┘  └────────────────┘  │
│         │                                                   │
│  ┌──────┴───────────────────────────────┐                   │
│  │            Scrapers                  │                   │
│  │  D4Builds · Maxroll · IcyVeins      │                   │
│  │         (Playwright)                 │                   │
│  └──────────────────────────────────────┘                   │
│                                                             │
│  ┌──────────────┐  ┌────────────────┐  ┌────────────────┐  │
│  │ ProcessMgr   │  │ HotkeyService  │  │ StorageService │  │
│  └──────────────┘  └────────────────┘  └────────────────┘  │
│                          │ IPC                              │
├──────────────────────────┼──────────────────────────────────┤
│                          │                                  │
│  ┌───────────────────────┴────────────────────────────────┐ │
│  │               Renderer Processes                       │ │
│  │                                                        │ │
│  │  Config Window              Overlay Window             │ │
│  │  ┌──────────────┐          ┌──────────────────┐       │ │
│  │  │ ImportForm   │          │ SkillsPanel      │       │ │
│  │  │ BuildLibrary │          │ ParagonPanel     │       │ │
│  │  │ BuildSummary │          │ GearPanel        │       │ │
│  │  │ Card         │          │ TabBar           │       │ │
│  │  └──────────────┘          └──────────────────┘       │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │               Shared Components                        │ │
│  │  ParagonBoardCanvas · BoardLayoutEngine                │ │
│  │  ParagonTooltip · paragonNodeUtils                     │ │
│  │  useCanvasTransform (zoom/pan hook)                    │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Dual-Window Design

| Window | Purpose | Behavior |
|--------|---------|----------|
| **Config Window** | Import builds, manage library, preview data | Standard resizable desktop window (1280×800 default) |
| **Overlay Window** | In-game HUD showing build info | Transparent, frameless, always-on-top, click-through |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- npm (comes with Node.js)

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

This launches the Electron app with hot-reload. The Config Window opens automatically.

### Build (Windows)

```bash
npm run build:win
```

Produces an NSIS installer and portable executable in the `dist/` directory.

### Testing

```bash
# Unit tests (Vitest)
npm run test:unit

# E2E tests (Playwright)
npx playwright test
```

**Current test coverage:**

- 55 unit tests across 9 test files
- 2 E2E test suites (paragon-zoom, paragon-visual)

---

## 📁 Project Structure

```
diablo4-companion/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.ts             # App lifecycle, windows, IPC, hotkeys
│   │   ├── scrapers/            # Playwright-based build scrapers
│   │   │   ├── D4BuildsScraper.ts
│   │   │   ├── MaxrollScraper.ts
│   │   │   └── IcyVeinsScraper.ts
│   │   └── services/            # Business logic
│   │       ├── BuildImportService.ts
│   │       ├── BuildRepository.ts
│   │       ├── ParagonCacheService.ts
│   │       ├── ProcessManager.ts
│   │       ├── HotkeyService.ts
│   │       └── StorageService.ts
│   ├── renderer/                # Config Window (React)
│   │   └── src/
│   │       ├── App.tsx
│   │       └── components/
│   │           ├── ImportForm.tsx
│   │           ├── BuildLibrary.tsx
│   │           ├── BuildSummaryCard.tsx
│   │           ├── StatusIndicator.tsx
│   │           └── Versions.tsx
│   ├── overlay/                 # Overlay Window (React)
│   │   └── src/
│   │       ├── App.tsx
│   │       └── components/
│   │           ├── SkillsPanel.tsx
│   │           ├── ParagonPanel.tsx
│   │           ├── GearPanel.tsx
│   │           ├── TabBar.tsx
│   │           ├── OverlayHeader.tsx
│   │           └── OverlayFooter.tsx
│   ├── shared/                  # Shared between both windows
│   │   ├── types.ts             # All TypeScript interfaces
│   │   ├── components/
│   │   │   ├── ParagonBoardCanvas.tsx
│   │   │   ├── ParagonTooltip.tsx
│   │   │   ├── boardLayoutEngine.ts
│   │   │   └── paragonNodeUtils.ts
│   │   └── hooks/
│   │       └── useCanvasTransform.ts
│   └── preload/                 # Electron preload scripts
├── test/
│   ├── unit/                    # Vitest unit tests
│   └── e2e/                     # Playwright E2E tests
├── data/                        # Portable data directory
│   ├── builds/                  # Saved build JSON files
│   └── classes/                 # Paragon cache
└── docs/plans/                  # Design and implementation plans
```

---

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| **Electron 39** | Desktop app framework |
| **React 19** | UI components |
| **TypeScript 5.9** | Type safety |
| **Vite 7** (via electron-vite) | Build tooling & HMR |
| **Playwright** | Headless browser scraping |
| **Vitest** | Unit testing |
| **electron-store** | User settings persistence |
| **electron-builder** | Packaging & distribution |

---

## 🗺️ Roadmap — What's Coming Next

### Near Term

- [ ] **Overlay layout testing** — Verify the spatial paragon board renders correctly inside the transparent overlay window
- [ ] **Multi-source layout testing** — Confirm Maxroll/IcyVeins builds fall back to linear chain layout gracefully
- [ ] **Gear panel visual polish** — Apply Diablo-themed styling to gear slots (currently functional but minimal)
- [ ] **Hotkey configuration UI** — Keybind editor in the Config Window for toggle-overlay, toggle-clickthrough, and cycle-tabs

### Medium Term

- [ ] **Build comparison** — Side-by-side diff of two builds showing skill/paragon/gear differences
- [ ] **Overlay opacity slider** — User-adjustable transparency for the in-game HUD
- [ ] **Auto-import from clipboard** — Detect build URLs copied to clipboard and offer to import
- [ ] **Build notes/tags** — Add personal notes and tags to saved builds for organization
- [ ] **Search & filter** — Filter the build library by class, source site, or tags

### Long Term

- [ ] **Build sharing** — Export builds as shareable links or files
- [ ] **Season tracking** — Track which builds belong to which season
- [ ] **Multiple game profiles** — Support for seasonal vs eternal characters
- [ ] **Auto-update** — In-app update mechanism for new releases
- [ ] **Portable mode** — Zero-install `.exe` that stores all data next to the executable

---

## 🤝 Contributing

This is currently a personal project. If you're interested in contributing, open an issue first to discuss what you'd like to work on.

---

## 📄 License

Private — All rights reserved.

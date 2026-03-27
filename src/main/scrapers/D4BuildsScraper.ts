import { BrowserWindow } from 'electron'
import { BuildScraper, RawBuildData, type ImportProgressCallback } from './BuildScraper'
import {
  BuildSourceSite,
  D4Class,
  ISkillAllocation,
  IParagonBoard,
  IGearSlot,
  IRune
} from '../../shared/types'
import { ParagonCacheService, type CachedNodeData } from '../services/ParagonCacheService'

export class D4BuildsScraper implements BuildScraper {
  readonly siteName = 'd4builds.gg'
  readonly sourceKey: BuildSourceSite = 'd4builds'

  private paragonCache: ParagonCacheService | null = null

  constructor(cacheDir?: string) {
    if (cacheDir) {
      this.paragonCache = new ParagonCacheService(cacheDir)
    }
  }

  clearCache(): void {
    this.paragonCache?.clear()
  }

  canHandle(url: string): boolean {
    const normalized = url.toLowerCase().trim()
    return normalized.includes('d4builds.gg/builds/')
  }

  private async waitForSelector(win: BrowserWindow, selector: string, timeoutMs: number = 10000): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const found = await win.webContents.executeJavaScript(`!!document.querySelector('${selector}')`)
      if (found) return
      await new Promise(r => setTimeout(r, 200))
    }
    throw new Error(`Timeout waiting for selector: ${selector}`)
  }

  async scrape(url: string, onProgress?: ImportProgressCallback): Promise<RawBuildData> {
    const TOTAL_STEPS = 6

    const win = new BrowserWindow({ 
      show: false, 
      width: 1920, 
      height: 1080,
      webPreferences: { sandbox: true }
    })

    try {
      onProgress?.({ step: 1, totalSteps: TOTAL_STEPS, label: 'Loading build page' })
      await win.loadURL(url)
      await this.waitForSelector(win, '.builder__header__description', 30000)
      await this.waitForSelector(win, '.build__skill__wrapper', 5000).catch(() => {})

      const buildName = await this.extractText(win, '.builder__header__description', 'Unknown Build')

      const d4ClassRaw: string = await win.webContents.executeJavaScript(`(function() {
        const el = document.querySelector('.builder__header__icon');
        if (!el) return 'Unknown';
        const classes = el.className.split(/\\s+/);
        return classes.find(c => c !== 'builder__header__icon') || 'Unknown';
      })()`).catch(() => 'Unknown')
      const d4Class = this.normalizeClass(d4ClassRaw)

      onProgress?.({ step: 2, totalSteps: TOTAL_STEPS, label: 'Importing skills' })
      const activeSkills = await this.scrapeActiveSkills(win)

      onProgress?.({ step: 3, totalSteps: TOTAL_STEPS, label: 'Importing skill tree' })
      const skillAllocations = await this.scrapeSkillTree(win)

      onProgress?.({ step: 4, totalSteps: TOTAL_STEPS, label: 'Importing paragon' })
      const paragonBoards = await this.scrapeParagon(win)

      onProgress?.({ step: 5, totalSteps: TOTAL_STEPS, label: 'Importing gear' })
      await this.clickTab(win, 'Gear')
      await new Promise(r => setTimeout(r, 300))
      const gearSlots = await this.scrapeGear(win)

      onProgress?.({ step: 6, totalSteps: TOTAL_STEPS, label: 'Importing runes' })
      const activeRunes = await this.scrapeRunes(win)

      const skills = skillAllocations.length > 0 ? skillAllocations : activeSkills

      return {
        name: buildName,
        d4Class,
        level: 100,
        skills,
        paragonBoards,
        gearSlots,
        activeRunes
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`Scraping failed for ${url}:`, message)
      throw new Error(`Failed to scrape D4Builds: ${message}`)
    } finally {
      win.close()
    }
  }

  private async extractText(win: BrowserWindow, selector: string, fallback: string): Promise<string> {
    try {
      return await win.webContents.executeJavaScript(`(function() {
        const el = document.querySelector('${selector}');
        return el && el.textContent ? el.textContent.trim() : '';
      })()`)
    } catch {
      return fallback
    }
  }

  private async clickTab(win: BrowserWindow, tabText: string): Promise<void> {
    try {
      await win.webContents.executeJavaScript(`(function() {
        const tabs = Array.from(document.querySelectorAll('.builder__navigation__link'));
        const tab = tabs.find(el => el.textContent && el.textContent.includes('${tabText}'));
        if (tab) tab.click();
      })()`)
      await new Promise(r => setTimeout(r, 500))
    } catch {
      console.warn(`Tab "${tabText}" not found, skipping`)
    }
  }

  private async scrapeActiveSkills(win: BrowserWindow): Promise<ISkillAllocation[]> {
    try {
      return await win.webContents.executeJavaScript(`(function() {
        const wrappers = Array.from(document.querySelectorAll('.build__skill__wrapper'));
        return wrappers.map(wrapper => {
          const classes = wrapper.className.split(/\\s+/);
          const skillClass = classes.find(c => c !== 'build__skill__wrapper' && c.trim() !== '') || 'Unknown';
          const skillName = skillClass.replace(/([a-z])([A-Z])/g, '$1 $2');
          return { skillName, points: 1, maxPoints: 1, tier: 'active', nodeType: 'active' };
        });
      })()`)
    } catch {
      return []
    }
  }

  private async scrapeSkillTree(win: BrowserWindow): Promise<ISkillAllocation[]> {
    await this.clickTab(win, 'Skill Tree')
    await this.waitForSelector(win, '.skill__tree__item', 10000).catch(() => {})

    try {
      const rawSkills: ISkillAllocation[] = await win.webContents.executeJavaScript(`(function() {
        const nodes = Array.from(document.querySelectorAll('.skill__tree__item--active'));
        return nodes.map(node => {
          const imgEl = node.querySelector('img');
          const altText = imgEl ? (imgEl.getAttribute('alt') || '') : '';
          if (!altText) return null;

          const skillName = altText.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\\b\\w/g, c => c.toUpperCase());
          const countEl = node.querySelector('.skill__tree__item__count');
          const countText = countEl && countEl.textContent ? countEl.textContent.trim() : '';
          const match = countText.match(/(\\d+)\\s*\\/\\s*(\\d+)/);
          const points = match ? parseInt(match[1], 10) : 1;
          const maxPoints = match ? parseInt(match[2], 10) : 1;

          if (points === 0) return null;

          const classes = node.className.split(/\\s+/);
          const isDiamond = classes.includes('diamond');
          const isLarge = classes.includes('large');
          let nodeType = 'passive';
          if (isLarge) nodeType = 'active';
          if (isDiamond) nodeType = 'passive';

          return { skillName, points, maxPoints, tier: 'core', nodeType };
        }).filter(Boolean);
      })()`)

      const seen = new Map<string, ISkillAllocation>()
      for (const skill of rawSkills) {
        if (!seen.has(skill.skillName)) {
          seen.set(skill.skillName, skill)
        }
      }
      return Array.from(seen.values())
    } catch {
      return []
    }
  }

  private async scrapeParagon(win: BrowserWindow): Promise<IParagonBoard[]> {
    await this.clickTab(win, 'Paragon')
    await this.waitForSelector(win, '.paragon__board', 10000).catch(() => {})

    try {
      const boardsData: any[] = await win.webContents.executeJavaScript(`(function() {
        return Array.from(document.querySelectorAll('.paragon__board')).map((board, index) => {
          const nameEl = board.querySelector('.paragon__board__name');
          let boardName = 'Board ' + (index + 1);
          if (nameEl) {
            const textParts = [];
            nameEl.childNodes.forEach(node => {
              if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent.trim();
                if (text) textParts.push(text);
              }
            });
            const rawName = textParts.join(' ').trim();
            boardName = rawName.replace(/^\\d+\\s*/, '').trim() || rawName;
          }

          const glyphEl = board.querySelector('.paragon__board__name__glyph');
          const glyphText = glyphEl && glyphEl.textContent ? glyphEl.textContent.trim() : null;
          const glyphName = glyphText ? glyphText.replace(/[()]/g, '').trim() : null;

          const allTiles = board.querySelectorAll('.paragon__board__tile');
          const boardStyle = board.getAttribute('style') || '';
          const boardRotMatch = boardStyle.match(/rotate\\(([-0-9]+)deg\\)/);
          const boardRotation = boardRotMatch ? parseInt(boardRotMatch[1], 10) : 0;
          const boardBgUrl = 'https://sunderarmor.com/DIABLO4/Paragon/board_bg.png';

          const topMatch = boardStyle.match(/top:\\s*([-0-9.]+)px/);
          const leftMatch = boardStyle.match(/left:\\s*([-0-9.]+)px/);
          const boardX = leftMatch ? parseFloat(leftMatch[1]) : 0;
          const boardY = topMatch ? parseFloat(topMatch[1]) : 0;

          const allocatedNodes = [];
          allTiles.forEach((tile) => {
            const iconImg = Array.from(tile.querySelectorAll('img.paragon__board__tile__icon')).find(img => !img.classList.contains('active'));
            const activeIconImg = tile.querySelector('img.paragon__board__tile__icon.active');
            const bgImg = tile.querySelector('img.paragon__board__tile__bg');

            const iconUrl = iconImg ? iconImg.getAttribute('src') : undefined;
            const activeIconUrl = activeIconImg ? activeIconImg.getAttribute('src') : undefined;
            const bgUrl = bgImg ? bgImg.getAttribute('src') : undefined;

            const altText = iconImg ? (iconImg.getAttribute('alt') || '').trim() : 'Node';
            if (!altText) altText = 'Node';
            
            const rawStyle = tile.getAttribute('style') || '';
            const rotateMatch = rawStyle.match(/rotate\\([^)]+\\)/);
            const styleTransform = rotateMatch ? rotateMatch[0] : undefined;
            const allocated = tile.classList.contains('active');

            const tileClasses = tile.className.toLowerCase();
            const matchRow = tileClasses.match(/\\br(\\d+)\\b/);
            const matchCol = tileClasses.match(/\\bc(\\d+)\\b/);
            const row = matchRow ? parseInt(matchRow[1], 10) : undefined;
            const col = matchCol ? parseInt(matchCol[1], 10) : undefined;

            const bgAlt = bgImg && bgImg.getAttribute('alt') ? bgImg.getAttribute('alt').toLowerCase() : '';
            let nodeType = 'normal';
            if (bgAlt.includes('legendary')) nodeType = 'legendary';
            else if (bgAlt.includes('rare')) nodeType = 'rare';
            else if (bgAlt.includes('magic')) nodeType = 'magic';
            else if (tileClasses.includes('radius')) nodeType = 'rare';
            else if (altText.toLowerCase() === 'gate' || tileClasses.includes('gate')) nodeType = 'gate';

            const nodeName = altText.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/\\b\\w/g, c => c.toUpperCase());

            allocatedNodes.push({ nodeName, nodeType, allocated, row, col, iconUrl, activeIconUrl, bgUrl, styleTransform });
          });

          return { boardName, boardIndex: index, glyph: glyphName ? { glyphName, level: 15 } : null, allocatedNodes, boardRotation, boardBgUrl, boardX, boardY, tileCount: allTiles.length };
        });
      })()`)

      const uncachedBoardIndices: number[] = []

      for (let bIdx = 0; bIdx < boardsData.length; bIdx++) {
        const boardData = boardsData[bIdx]
        const cachedNodes = this.paragonCache?.get(boardData.boardName)

        if (cachedNodes) {
          for (const node of boardData.allocatedNodes) {
            const cached = cachedNodes.find((c) => c.row === node.row && c.col === node.col)
            if (cached) {
              if (cached.nodeName) node.nodeName = cached.nodeName
              if (cached.nodeDescription) node.nodeDescription = cached.nodeDescription
            }
          }
        } else {
          uncachedBoardIndices.push(bIdx)
        }
      }

      if (uncachedBoardIndices.length > 0) {
        const tileIndices: Array<{ boardIdx: number; tileIdx: number }> = []
        for (const bIdx of uncachedBoardIndices) {
          for (let tIdx = 0; tIdx < boardsData[bIdx].allocatedNodes.length; tIdx++) {
            const n = boardsData[bIdx].allocatedNodes[tIdx]
            if (n.allocated || n.nodeType === 'rare' || n.nodeType === 'legendary' || n.nodeType === 'gate') {
              tileIndices.push({ boardIdx: bIdx, tileIdx: tIdx })
            }
          }
        }

        const allTooltipData: any[] = await win.webContents.executeJavaScript(`
          (async function(indices) {
            const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const results = [];
            const boards = document.querySelectorAll('.paragon__board');
            for (const { boardIdx, tileIdx } of indices) {
              const board = boards[boardIdx];
              if (!board) continue;
              const tiles = board.querySelectorAll('.paragon__board__tile');
              const tile = tiles[tileIdx];
              if (!tile) continue;
              tile.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
              await delay(50);
              const tooltip = document.querySelector('.paragon__tile__tooltip');
              if (!tooltip) {
                tile.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, cancelable: true }));
                await delay(10);
                continue;
              }
              const parts = [];
              const nameEl = tooltip.querySelector('.paragon__tile__tooltip__name');
              const tooltipName = nameEl && nameEl.textContent ? nameEl.textContent.trim() : null;
              let extractedName = null;
              if (tooltipName) {
                const rarityEl = tooltip.querySelector('.paragon__tile__tooltip__rarity');
                const rarityText = rarityEl && rarityEl.textContent ? rarityEl.textContent : '';
                const nameOnly = tooltipName.replace(rarityText, '').trim();
                if (nameOnly) extractedName = nameOnly;
              }
              tooltip.querySelectorAll('.paragon__tile__tooltip__stat').forEach((stat) => {
                const text = stat.textContent ? stat.textContent.trim() : null;
                if (text) parts.push(text);
              });
              const descEl = tooltip.querySelector('.paragon__tile__tooltip__description');
              if (descEl) {
                const text = descEl.textContent ? descEl.textContent.trim() : null;
                if (text) parts.push(text);
              }
              tooltip.querySelectorAll('.paragon__tile__bonus__requirement, .paragon__tile__bonus__stats').forEach((el) => {
                const text = el.textContent ? el.textContent.trim() : null;
                if (text) parts.push(text);
              });
              tile.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, cancelable: true }));
              await delay(10);
              if (parts.length > 0 || extractedName) {
                results.push({ boardIdx, tileIdx, name: extractedName, description: parts.length > 0 ? parts.join('\\n') : null });
              }
            }
            return results;
          })(${JSON.stringify(tileIndices)})
        `).catch(() => [])

        for (const tip of allTooltipData) {
          const board = boardsData[tip.boardIdx]
          if (!board) continue
          const node = board.allocatedNodes[tip.tileIdx]
          if (!node) continue
          if (tip.name) node.nodeName = tip.name
          if (tip.description) node.nodeDescription = tip.description
        }

        for (const bIdx of uncachedBoardIndices) {
          const boardData = boardsData[bIdx]
          const cacheEntries: CachedNodeData[] = boardData.allocatedNodes.map((n: any) => ({
            nodeName: n.nodeName,
            nodeType: n.nodeType,
            nodeDescription: n.nodeDescription,
            row: n.row,
            col: n.col,
            iconUrl: n.iconUrl,
            activeIconUrl: n.activeIconUrl,
            bgUrl: n.bgUrl,
            styleTransform: n.styleTransform
          }))
          this.paragonCache?.set(boardData.boardName, cacheEntries)
        }
      }

      return boardsData.map((b) => ({
        boardName: b.boardName,
        boardIndex: b.boardIndex,
        glyph: b.glyph,
        allocatedNodes: b.allocatedNodes,
        boardRotation: b.boardRotation,
        boardBgUrl: b.boardBgUrl,
        boardX: b.boardX,
        boardY: b.boardY
      }))
    } catch {
      return []
    }
  }

  private async scrapeGear(win: BrowserWindow): Promise<IGearSlot[]> {
    await this.waitForSelector(win, '.builder__gear__item', 10000).catch(() => {})

    try {
      const topGear: any[] = await win.webContents.executeJavaScript(`(function() {
        return Array.from(document.querySelectorAll('.builder__gear__item')).map((item) => {
          const slotEl = item.querySelector('.builder__gear__slot');
          const slot = slotEl && slotEl.textContent ? slotEl.textContent.trim() : 'Unknown Slot';

          const nameEl = item.querySelector('.builder__gear__name');
          const itemName = nameEl && nameEl.textContent ? nameEl.textContent.trim() : null;
          const nameClass = nameEl ? nameEl.className : '';

          let itemType = 'Legendary';
          if (nameClass.includes('--mythic') || nameClass.includes('--unique')) {
            itemType = 'Unique';
          } else if (nameClass.includes('--rare')) {
            itemType = 'Rare';
          }

          const socketedGems = [];
          const gemsContainer = item.querySelector('.builder__new__gems');
          if (gemsContainer) {
            const gemItems = gemsContainer.querySelectorAll('.builder__gems__item');
            gemItems.forEach((gem) => {
              const img = gem.querySelector('img');
              const gemName = img && img.getAttribute('alt') ? img.getAttribute('alt').trim() : null;
              if (gemName) socketedGems.push(gemName);
            });
          }

          return { slot, itemName, itemType, socketedGems };
        });
      })()`)

      const statsData: any[] = await win.webContents.executeJavaScript(`(function() {
        return Array.from(document.querySelectorAll('.builder__stats__group')).map((group) => {
          const slotEl = group.querySelector('.builder__stats__slot');
          const slot = slotEl && slotEl.textContent ? slotEl.textContent.trim() : 'Unknown';

          const affixes = [];
          const implicitAffixes = [];
          const temperedAffixes = [];
          const greaterAffixes = [];
          let rampageEffect = null;
          let feastEffect = null;
          let isImplicitSection = false;
          
          const rows = group.querySelectorAll('.stat__dropdown__wrapper, .builder__stat');
          rows.forEach((row) => {
            const text = row.textContent ? row.textContent.trim() : '';

            if (row.classList.contains('implicit') || text.toLowerCase() === 'implicit stat') {
              isImplicitSection = true; return;
            }
            if (text.toLowerCase() === 'bloodied affix') return;
            if (text.startsWith('Rampage:')) { rampageEffect = text; return; }
            if (text.startsWith('Feast:')) { feastEffect = text; return; }

            const isGreater = !!row.querySelector('.greater__affix__button--filled');
            const isTempered = !!row.querySelector('img[src*="tempering"]');
            const statSpan = row.querySelector('.dropdown__button span');
            const statText = statSpan && statSpan.textContent ? statSpan.textContent.trim() : text;

            if (!statText || statText.toLowerCase() === 'implicit stat') return;

            const affix = { name: statText, isGreater };

            if (isTempered) temperedAffixes.push(affix);
            else if (isGreater) greaterAffixes.push(affix);
            else if (isImplicitSection) implicitAffixes.push(affix);
            else { isImplicitSection = false; affixes.push(affix); }
          });

          const dedup = (arr) => {
            const seen = new Set();
            return arr.filter((a) => {
              if (seen.has(a.name)) return false;
              seen.add(a.name);
              return true;
            });
          };

          return { slot, affixes: dedup(affixes), implicitAffixes: dedup(implicitAffixes), temperedAffixes: dedup(temperedAffixes), greaterAffixes: dedup(greaterAffixes), rampageEffect, feastEffect };
        });
      })()`)

      const aspectData: any[] = await win.webContents.executeJavaScript(`
        (async function() {
          const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
          const results = [];
          const gearItems = document.querySelectorAll('.builder__gear__item');
          for (let i = 0; i < gearItems.length; i++) {
            const item = gearItems[i];
            item.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
            await delay(150);

            const tooltip = document.querySelector('.codex__tooltip');
            if (tooltip) {
              const nameEl = tooltip.querySelector('.codex__tooltip__name');
              const descEl = tooltip.querySelector('.codex__tooltip__description');
              results.push({
                index: i,
                name: nameEl && nameEl.textContent ? nameEl.textContent.trim() : null,
                description: descEl && descEl.textContent ? descEl.textContent.trim() : null
              });
            }

            item.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, cancelable: true }));
            await delay(50);
          }
          return results;
        })()
      `).catch(() => [])

      return topGear
        .filter((gear) => gear.slot !== 'Unknown Slot')
        .map((gear, i) => {
          const stats = statsData.find((s) => s.slot.toLowerCase() === gear.slot.toLowerCase()) || {
            affixes: [], implicitAffixes: [], temperedAffixes: [], greaterAffixes: [], rampageEffect: null, feastEffect: null
          }
          const aspect = aspectData.find((a) => a.index === i)
          return {
            slot: gear.slot,
            itemName: gear.itemName,
            itemType: gear.itemType,
            requiredAspect: aspect?.name ? { name: aspect.name, description: aspect.description || null } : null,
            affixes: stats.affixes,
            implicitAffixes: stats.implicitAffixes,
            temperedAffixes: stats.temperedAffixes,
            greaterAffixes: stats.greaterAffixes,
            masterworkPriority: [],
            rampageEffect: stats.rampageEffect,
            feastEffect: stats.feastEffect,
            socketedGems: gear.socketedGems || []
          }
        })
    } catch {
      return []
    }
  }

  private async scrapeRunes(win: BrowserWindow): Promise<IRune[]> {
    try {
      const runeData: any[] = await win.webContents.executeJavaScript(`(function() {
        const allGemContainers = document.querySelectorAll('.builder__gems');
        const results = [];
        for (const container of allGemContainers) {
          if (container.closest('.builder__gear__item')) continue;
          const items = container.querySelectorAll('.builder__gems__item');
          items.forEach((item, i) => {
            const nameEl = item.querySelector('.builder__gem__slot');
            const name = nameEl && nameEl.textContent ? nameEl.textContent.trim() : null;
            if (name) results.push({ name, index: i });
          });
        }
        return results;
      })()`)

      if (runeData.length === 0) return []

      const runes: IRune[] = []
      for (let i = 0; i < runeData.length; i++) {
        try {
          const tooltipInfo = await win.webContents.executeJavaScript(`
            (async function() {
              const items = document.querySelectorAll('.builder__gems:not(.builder__gear__item .builder__gems) .builder__gems__item');
              const runeEl = items[${i}];
              if (!runeEl) return null;
              
              if (runeEl.offsetWidth === 0 && runeEl.offsetHeight === 0) return { hidden: true };

              runeEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
              await new Promise(r => setTimeout(r, 300));

              const tooltip = document.querySelector('.gem__tooltip');
              if (!tooltip) return null;

              const nameEl = tooltip.querySelector('.gem__tooltip__name');
              const typeEl = tooltip.querySelector('.gem__tooltip__class');
              const effectEls = tooltip.querySelectorAll('.gem__tooltip__effect');
              
              const effects = [];
              effectEls.forEach((el) => {
                const text = el.textContent ? el.textContent.trim() : null;
                if (text) effects.push(text);
              });

              return {
                name: nameEl && nameEl.textContent ? nameEl.textContent.trim() : null,
                runeType: typeEl && typeEl.textContent ? typeEl.textContent.trim() : null,
                effects
              };
            })()
          `)

          if (tooltipInfo && !tooltipInfo.hidden) {
            runes.push({
              name: tooltipInfo.name || runeData[i].name,
              runeType: tooltipInfo.runeType || 'Rune',
              effects: tooltipInfo.effects || []
            })
          } else {
            runes.push({ name: runeData[i].name, runeType: 'Rune', effects: [] })
          }
        } catch {
          runes.push({ name: runeData[i].name, runeType: 'Rune', effects: [] })
        }
      }
      return runes
    } catch {
      return []
    }
  }

  private normalizeClass(raw: string): D4Class {
    const lower = raw.toLowerCase()
    if (lower.includes('barbarian')) return 'Barbarian'
    if (lower.includes('druid')) return 'Druid'
    if (lower.includes('necromancer')) return 'Necromancer'
    if (lower.includes('rogue')) return 'Rogue'
    if (lower.includes('sorcerer') || lower.includes('sorceress')) return 'Sorcerer'
    if (lower.includes('spiritborn')) return 'Spiritborn'
    if (lower.includes('paladin')) return 'Paladin' as D4Class
    return 'Barbarian'
  }
}

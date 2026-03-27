import re
import sys
import json

def rewrite_scraper(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Imports
    content = content.replace("import { chromium, Page } from 'playwright'", "import { BrowserWindow } from 'electron'")
    content = content.replace("import { ProcessManager } from '../services/ProcessManager'\n", "")
    content = content.replace("import { getBrowserPath } from '../services/BrowserPath'\n", "")

    # 2. Method Signatures
    content = content.replace("private async extractText(page: Page,", "private async extractText(win: BrowserWindow,")
    content = content.replace("private async clickTab(page: Page,", "private async clickTab(win: BrowserWindow,")
    content = content.replace("private async scrapeActiveSkills(page: Page)", "private async scrapeActiveSkills(win: BrowserWindow)")
    content = content.replace("private async scrapeSkillTree(page: Page)", "private async scrapeSkillTree(win: BrowserWindow)")
    content = content.replace("private async scrapeParagon(page: Page)", "private async scrapeParagon(win: BrowserWindow)")
    content = content.replace("private async scrapeGear(page: Page)", "private async scrapeGear(win: BrowserWindow)")
    content = content.replace("private async scrapeRunes(page: Page)", "private async scrapeRunes(win: BrowserWindow)")
    content = content.replace("export class D4BuildsScraper extends BuildScraper {", "export class D4BuildsScraper implements BuildScraper {\n  private async waitForSelector(win: BrowserWindow, selector: string, timeoutMs: number = 10000): Promise<void> {\n    const start = Date.now()\n    while (Date.now() - start < timeoutMs) {\n      const found = await win.webContents.executeJavaScript(`!!document.querySelector('${selector}')`)\n      if (found) return\n      await new Promise(r => setTimeout(r, 200))\n    }\n    throw new Error(`Timeout waiting for selector: ${selector}`)\n  }")

    # 3. scrape() Method Setup
    setup_old = """    const browserPath = await getBrowserPath((progress) => {
      onProgress?.({
        step: 0,
        totalSteps: TOTAL_STEPS,
        label: progress.message
      })
    })

    const browser = await chromium.launch({ headless: true, executablePath: browserPath })
    ProcessManager.getInstance().register(browser)
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    })
    const page = await context.newPage()"""
    setup_new = """    const win = new BrowserWindow({ show: false, width: 1920, height: 1080, webPreferences: { sandbox: true } })"""
    content = content.replace(setup_old, setup_new)

    content = content.replace("await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })", "await win.loadURL(url)")
    content = content.replace("await page.waitForSelector", "await this.waitForSelector(win, ")
    content = content.replace("page.waitForTimeout", "new Promise(r => setTimeout(r, ") # dirty but handles simple numeric arg
    
    # page calls -> win calls
    content = content.replace("page, '.builder__header'", "win, '.builder__header'")
    content = content.replace("this.extractText(\n        page,", "this.extractText(\n        win,")
    content = content.replace("this.scrapeActiveSkills(page)", "this.scrapeActiveSkills(win)")
    content = content.replace("this.scrapeSkillTree(page)", "this.scrapeSkillTree(win)")
    content = content.replace("this.scrapeParagon(page)", "this.scrapeParagon(win)")
    content = content.replace("this.clickTab(page,", "this.clickTab(win,")
    content = content.replace("this.scrapeGear(page)", "this.scrapeGear(win)")
    content = content.replace("this.scrapeRunes(page)", "this.scrapeRunes(win)")

    # 4. Cleanup
    close_old = """      await browser.close()
      ProcessManager.getInstance().unregister(browser)"""
    close_new = """      win.close()"""
    content = content.replace(close_old, close_new)

    # 5. Helper Methods (extractText, clickTab)
    content = content.replace("return await page.$eval(selector, (el) => el.textContent?.trim() || '')", "return await win.webContents.executeJavaScript(`(function() { const el = document.querySelector('${selector}'); return el && el.textContent ? el.textContent.trim() : ''; })()`)")
    clickTabOld = """const tab = page.locator('.builder__navigation__link', { hasText: tabText }).first()
      await tab.click({ timeout: 5000 })"""
    clickTabNew = """await win.webContents.executeJavaScript(`
        (function() {
          const links = Array.from(document.querySelectorAll('.builder__navigation__link'))
          const link = links.find(el => el.textContent && el.textContent.includes('${tabText}'))
          if (link) link.click()
        })()
      `)"""
    content = content.replace(clickTabOld, clickTabNew)

    # 6. D4 Class Raw Extraction
    classRawOld = """const d4ClassRaw = await page
        .$eval('.builder__header__icon', (el) => {
          const classes = el.className.split(/\\s+/)
          return classes.find((c) => c !== 'builder__header__icon') || 'Unknown'
        })"""
    classRawNew = """const d4ClassRaw = await win.webContents.executeJavaScript(`(function() {
      const el = document.querySelector('.builder__header__icon');
      if (!el) return 'Unknown';
      const classes = el.className.split(/\\\\s+/);
      return classes.find(c => c !== 'builder__header__icon') || 'Unknown';
    })()`)"""
    content = content.replace(classRawOld, classRawNew)

    # 7. Convert $$eval with simple wrapping logic
    # Find all await page.$$eval('.selector', (arguments) => { ... })
    # This requires a bit of regex parsing.
    # Luckily, all the $$eval blocks in this file end cleanly at their scope.
    
    # Active Skills
    skills_old = """return await page.$$eval('.build__skill__wrapper', (wrappers) => {
        return wrappers.map((wrapper) => {"""
    skills_new = """return await win.webContents.executeJavaScript(`
        (function() {
          const wrappers = Array.from(document.querySelectorAll('.build__skill__wrapper'))
          return wrappers.map((wrapper) => {"""
    content = content.replace(skills_old, skills_new)
    content = content.replace("})\n      })\n    } catch", "})\n        })()\n      `)\n    } catch") # close the active skills wrapper

    # Skill Tree
    stree_old = """const rawSkills = await page.$$eval('.skill__tree__item--active', (nodes) => {
        return nodes
          .map((node) => {"""
    stree_new = """const rawSkills = await win.webContents.executeJavaScript(`
        (function() {
          const nodes = Array.from(document.querySelectorAll('.skill__tree__item--active'))
          return nodes
            .map((node) => {"""
    content = content.replace(stree_old, stree_new)
    content = content.replace(".filter(Boolean)\n      })\n\n      // DEDUPLICATE", ".filter(Boolean)\n        })()\n      `)\n\n      // DEDUPLICATE")

    # Paragon Phase A
    paragon_a_old = """const boardsData = await page.$$eval('.paragon__board', (boards) => {
        return boards.map((board, index) => {"""
    paragon_a_new = """const boardsData = await win.webContents.executeJavaScript(`
        (function() {
          const boards = Array.from(document.querySelectorAll('.paragon__board'))
          return boards.map((board, index) => {"""
    content = content.replace(paragon_a_old, paragon_a_new)
    # The end of Phase A is followed by Phase B
    content = content.replace("})\n      })\n\n      // ── Phase B:", "})\n        })()\n      `)\n\n      // ── Phase B:")

    # Paragon Phase B (evaluate)
    pb_eval_old = """const allTooltipData = await page
          .evaluate(async (indices: Array<{ boardIdx: number; tileIdx: number }>) => {"""
    pb_eval_new = """      const allTooltipData = await win.webContents
          .executeJavaScript(`
            (async function(indices) {"""
    content = content.replace(pb_eval_old, pb_eval_new)
    # The end of Phase B evaluate is followed by .catch
    content = content.replace("return results\n          }, tileIndices)\n          .catch(", "return results\n            })(${JSON.stringify(tileIndices)})\n          `)\n          .catch(")

    # Gear Phase A
    ga_old = """const topGear = await page.$$eval('.builder__gear__item', (items) => {
        return items.map((item) => {"""
    ga_new = """const topGear = await win.webContents.executeJavaScript(`
        (function() {
          const items = Array.from(document.querySelectorAll('.builder__gear__item'))
          return items.map((item) => {"""
    content = content.replace(ga_old, ga_new)
    content = content.replace("})\n      })\n\n      // ── Phase B: Gear Stats grid", "})\n        })()\n      `)\n\n      // ── Phase B: Gear Stats grid")

    # Gear Phase B
    gb_old = """const statsData = await page.$$eval('.builder__stats__group', (groups) => {
        return groups.map((group) => {"""
    gb_new = """const statsData = await win.webContents.executeJavaScript(`
        (function() {
          const groups = Array.from(document.querySelectorAll('.builder__stats__group'))
          return groups.map((group) => {"""
    content = content.replace(gb_old, gb_new)
    content = content.replace("})\n      })\n\n      // ── Phase C: Hover gear items", "})\n        })()\n      `)\n\n      // ── Phase C: Hover gear items")

    # Gear Phase C (evaluate)
    gc_eval_old = """const aspectData = await page
        .evaluate(async () => {"""
    gc_eval_new = """const aspectData = await win.webContents
        .executeJavaScript(`
          (async function() {"""
    content = content.replace(gc_eval_old, gc_eval_new)
    content = content.replace("return results\n        })\n        .catch(", "return results\n          })()\n        `)\n        .catch(")

    # Runes
    runes_eval_old = """const runeData = await page.evaluate(() => {"""
    runes_eval_new = """const runeData = await win.webContents.executeJavaScript(`
        (function() {"""
    content = content.replace(runes_eval_old, runes_eval_new)
    content = content.replace("return results\n      })\n\n      if (runeData.length", "return results\n        })()\n      `)\n\n      if (runeData.length")

    rune2_eval_old = """const runeEl = page
            .locator('.builder__gems:not(.builder__gear__item .builder__gems) .builder__gems__item')
            .nth(i)

          const isVisible = await runeEl.isVisible().catch(() => false)
          if (!isVisible) {
            runes.push({
              name: runeData[i].name,
              runeType: 'Rune',
              effects: []
            })
            continue
          }

          // Hover using Playwright for reliable tooltip triggering
          await runeEl.hover({ force: true })
          await page.waitForTimeout(300)

          // Now extract tooltip data
          const tooltipInfo = await page.evaluate(() => {"""
    # Because we don't have Playwright, we must dispatch mouse events via executeJavaScript
    rune2_eval_new = """
          const tooltipInfo = await win.webContents.executeJavaScript(`
            (async function() {
              const delay = (ms) => new Promise(r => setTimeout(r, ms));
              const items = document.querySelectorAll('.builder__gems:not(.builder__gear__item .builder__gems) .builder__gems__item');
              const runeEl = items[${i}];
              if (!runeEl) return null;
              
              runeEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
              await delay(300);
              """
    content = content.replace(rune2_eval_old, rune2_eval_new)
    # The end of rune2 evaluate
    end_rune2_old = """return {
              name: nameEl?.textContent?.trim() || null,
              runeType: typeEl?.textContent?.trim() || null,
              effects
            }
          })"""
    end_rune2_new = """return {
                name: nameEl ? nameEl.textContent.trim() : null,
                runeType: typeEl ? typeEl.textContent.trim() : null,
                effects
              };
            })()
          `);"""
    content = content.replace(end_rune2_old, end_rune2_new)

    # Finally, we must escape backticks inside the executeJavaScript template strings, EXCEPT the outer ones.
    # A cleaner approach is to use triple quotes in Python to do replace("`", "\`") safely, but that's hard to target.
    # Actually, we can use regex to find contents inside backticks and escape inner backticks/variables.
    # Wait: all the template strings we just injected are `...`. Any inner `${x}` will be interpolated BY TYPESCRIPT.
    # If there are inner `${}` or inner backticks, they need escaping.
    # Let's fix simple ones. `!!document.querySelector('${selector}')` is fine, we want JS interpolation.
    
    # Save the file
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

rewrite_scraper('src/main/scrapers/D4BuildsScraper.ts')

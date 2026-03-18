/**
 * EquippedGearService — Manages the user's actual in-game equipped items.
 *
 * When "Equip Mode" is active, scanned items are saved here as the
 * user's actual gear on their active build profile. This creates a
 * complete picture of what the user is wearing vs what the build requires.
 *
 * Persistence:
 *   Each build gets its own `equipped.json` file in the builds directory.
 *   Format: { buildId, slots: { "Helm": IScannedItem, ... }, lastUpdated }
 */

import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import type { IScannedItem, IEquippedGear } from '../../shared/types'

export class EquippedGearService {
  /** In-memory cache of equipped gear per build */
  private cache = new Map<string, IEquippedGear>()

  /** Directory where build data is stored */
  private buildsDir: string

  constructor(buildsDir: string) {
    this.buildsDir = buildsDir
  }

  /**
   * Equips a scanned item to the given build.
   *
   * Auto-detects the gear slot from the scanned item's `slot` field.
   * For rings, uses the `ringSlot` parameter to distinguish Ring 1 vs Ring 2.
   *
   * @param buildId - The active build's ID
   * @param item - The scanned item to equip
   * @param ringSlot - For rings: 1 or 2 (optional, defaults to first empty)
   * @returns The updated equipped gear state
   */
  async equipItem(
    buildId: string,
    item: IScannedItem,
    ringSlot?: 1 | 2
  ): Promise<IEquippedGear> {
    const gear = await this.load(buildId)

    // Determine the slot key
    let slotKey = item.slot

    // Handle ring disambiguation
    if (slotKey.toLowerCase() === 'ring') {
      if (ringSlot) {
        slotKey = `Ring ${ringSlot}`
      } else {
        // Auto-fill: use first empty ring slot, or Ring 1
        slotKey = !gear.slots['Ring 1'] ? 'Ring 1' : 'Ring 2'
      }
    }

    // Check for duplicate: if the item is the same as what's equipped, skip
    const current = gear.slots[slotKey]
    if (current && this.isSameItem(current, item)) {
      console.log(`[EquippedGear] Slot "${slotKey}" already has this item, skipping`)
      return gear
    }

    // Equip the item
    gear.slots[slotKey] = {
      ...item,
      scannedAt: new Date().toISOString()
    }
    gear.lastUpdated = new Date().toISOString()

    // Save to disk
    await this.save(gear)

    console.log(`[EquippedGear] Equipped "${item.itemName}" in slot "${slotKey}"`)
    return gear
  }

  /**
   * Gets the equipped gear for a build.
   */
  async getEquippedGear(buildId: string): Promise<IEquippedGear> {
    return this.load(buildId)
  }

  /**
   * Clears a specific slot.
   */
  async clearSlot(buildId: string, slotKey: string): Promise<IEquippedGear> {
    const gear = await this.load(buildId)
    delete gear.slots[slotKey]
    gear.lastUpdated = new Date().toISOString()
    await this.save(gear)
    return gear
  }

  /**
   * Clears all equipped gear for a build.
   */
  async clearAll(buildId: string): Promise<IEquippedGear> {
    const gear: IEquippedGear = {
      buildId,
      slots: {},
      lastUpdated: new Date().toISOString()
    }
    this.cache.set(buildId, gear)
    await this.save(gear)
    return gear
  }

  /**
   * Returns a summary of which slots are filled and which are empty.
   */
  async getSlotSummary(buildId: string): Promise<Record<string, boolean>> {
    const gear = await this.load(buildId)
    const ALL_SLOTS = [
      'Helm', 'Chest Armor', 'Gloves', 'Pants', 'Boots',
      'Amulet', 'Ring 1', 'Ring 2',
      'Weapon', 'Offhand'
    ]

    const summary: Record<string, boolean> = {}
    for (const slot of ALL_SLOTS) {
      summary[slot] = !!gear.slots[slot]
    }
    return summary
  }

  // ──────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────

  /**
   * Loads equipped gear from disk or cache.
   */
  private async load(buildId: string): Promise<IEquippedGear> {
    // Check cache first
    const cached = this.cache.get(buildId)
    if (cached) return cached

    // Try loading from disk
    const filePath = this.getFilePath(buildId)
    if (existsSync(filePath)) {
      try {
        const raw = await readFile(filePath, 'utf-8')
        const gear = JSON.parse(raw) as IEquippedGear
        this.cache.set(buildId, gear)
        return gear
      } catch (err) {
        console.error(`[EquippedGear] Failed to load ${filePath}:`, err)
      }
    }

    // Create empty gear state
    const empty: IEquippedGear = {
      buildId,
      slots: {},
      lastUpdated: new Date().toISOString()
    }
    this.cache.set(buildId, empty)
    return empty
  }

  /**
   * Saves equipped gear to disk.
   */
  private async save(gear: IEquippedGear): Promise<void> {
    this.cache.set(gear.buildId, gear)

    const filePath = this.getFilePath(gear.buildId)
    const dir = join(this.buildsDir, gear.buildId)

    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }

    await writeFile(filePath, JSON.stringify(gear, null, 2), 'utf-8')
  }

  /**
   * Returns the file path for a build's equipped gear.
   */
  private getFilePath(buildId: string): string {
    return join(this.buildsDir, buildId, 'equipped.json')
  }

  /**
   * Checks if two scanned items are effectively the same.
   * Compares name and item power — if both match, it's a duplicate scan.
   */
  private isSameItem(a: IScannedItem, b: IScannedItem): boolean {
    return (
      a.itemName === b.itemName &&
      a.itemPower === b.itemPower &&
      a.slot === b.slot
    )
  }
}

import type {
  BuildSourceSite,
  ISkillAllocation,
  IParagonBoard,
  IGearSlot,
  IRune
} from '../../shared/types'

/** Raw data scraped from a build website before normalization. */
export interface RawBuildData {
  name: string
  d4Class: string
  level: number
  skills: ISkillAllocation[]
  paragonBoards: IParagonBoard[]
  gearSlots: IGearSlot[]
  activeRunes: IRune[]
}

/** Progress update sent during a build import */
export interface ImportProgress {
  step: number
  totalSteps: number
  label: string
}

/** Callback fired at each phase boundary during scraping */
export type ImportProgressCallback = (progress: ImportProgress) => void

/** Interface for all build scrapers */
export interface BuildScraper {
  readonly siteName: string
  readonly sourceKey: BuildSourceSite
  canHandle(url: string): boolean
  scrape(url: string, onProgress?: ImportProgressCallback): Promise<RawBuildData>
}

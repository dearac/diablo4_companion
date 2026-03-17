import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

/**
 * StorageService manages all file paths for the app.
 *
 * The most important rule of this app: NOTHING is ever saved
 * outside the folder where the .exe lives. No %APPDATA%, no
 * temp folders, no hidden system directories. Everything stays
 * right next to the executable in a "data" folder.
 *
 * This makes the app completely portable — you can copy the
 * folder to a USB drive and it just works.
 */
export class StorageService {
  /** The root directory where the app lives (where the .exe is) */
  private baseDir: string

  constructor(baseDir: string) {
    this.baseDir = baseDir
  }

  /**
   * Returns all data directory paths, relative to the app folder.
   * Also creates any directories that don't exist yet.
   */
  getDataPaths(): DataPaths {
    const paths = getDataPaths(this.baseDir)
    this.ensureDirectoriesExist(paths)
    return paths
  }

  /**
   * Creates any missing directories so the app doesn't crash
   * trying to save files to a folder that doesn't exist.
   */
  private ensureDirectoriesExist(paths: DataPaths): void {
    const dirs = [paths.userData, paths.builds, paths.classes, paths.icons, paths.scans]
    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
    }
  }
}

/**
 * All the directory paths the app uses for storing data.
 * Every path is relative to wherever the .exe is located.
 */
export interface DataPaths {
  /** Root data folder — everything lives under here */
  userData: string
  /** Where saved build JSON files are stored */
  builds: string
  /** Where cached class data (skill tree layouts, paragon boards) is stored */
  classes: string
  /** Where downloaded skill and node icon images are stored */
  icons: string
  /** Where OCR scan results and history are stored */
  scans: string
  /** Path to the settings/config file */
  config: string
}

/**
 * Pure function that computes all data paths from a base directory.
 * This is separated from the class so tests can call it without
 * needing to create directories on disk.
 */
export function getDataPaths(baseDir: string): DataPaths {
  const userData = join(baseDir, 'data')
  return {
    userData,
    builds: join(userData, 'builds'),
    classes: join(userData, 'classes'),
    icons: join(userData, 'icons'),
    scans: join(userData, 'scans'),
    config: join(userData, 'config.json')
  }
}

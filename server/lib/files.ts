import { unlinkSync } from 'node:fs'

/** Ignores a missing file: the plan accepts that the DB and uploads/ can drift. */
export function unlinkIfExists(path: string): void {
  try {
    unlinkSync(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

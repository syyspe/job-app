import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

export interface TempDir {
  root: string
  write: (relativePath: string, text: string) => string
  remove: () => void
}

export function makeTempDir(): TempDir {
  const root = mkdtempSync(join(tmpdir(), 'job-agent-'))
  return {
    root,
    write: (relativePath, text) => {
      const path = join(root, relativePath)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, text)
      return path
    },
    remove: () => rmSync(root, { recursive: true, force: true }),
  }
}

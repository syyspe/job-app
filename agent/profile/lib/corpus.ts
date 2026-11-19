import { readdirSync, statSync } from 'node:fs'
import { basename, extname, join, relative } from 'node:path'
import { CliError } from '../../lib/cliError.ts'
import type { CorpusEntry, Label } from './config.ts'

export interface CorpusFile {
  path: string
  label: Label
  source: string
}

const INDEXED_EXTENSIONS = new Set(['.txt', '.md'])

function filesOf(entry: CorpusEntry, index: number): string[] {
  const stat = statSync(entry.path, { throwIfNoEntry: false })
  if (!stat) throw new CliError(2, `config corpus[${index}].path: ${entry.path} does not exist`)
  if (!stat.isDirectory()) return [entry.path]
  return readdirSync(entry.path, { recursive: true, withFileTypes: true })
    .filter((dirent) => dirent.isFile())
    .map((dirent) => join(dirent.parentPath, dirent.name))
    .sort()
}

function sourceOf(entry: CorpusEntry, path: string): string {
  return path === entry.path ? basename(path) : relative(entry.path, path)
}

export function listCorpusFiles(entries: CorpusEntry[]): { files: CorpusFile[]; skipped: string[] } {
  const owner = new Map<string, number>()
  const files: CorpusFile[] = []
  const skipped: string[] = []
  entries.forEach((entry, index) => {
    for (const path of filesOf(entry, index)) {
      const earlier = owner.get(path)
      if (earlier !== undefined) {
        throw new CliError(2, `config corpus[${index}]: ${path} is also reached by corpus[${earlier}]`)
      }
      owner.set(path, index)
      if (!INDEXED_EXTENSIONS.has(extname(path).toLowerCase())) skipped.push(path)
      else files.push({ path, label: entry.label, source: sourceOf(entry, path) })
    }
  })
  return { files, skipped }
}

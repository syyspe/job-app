import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { chunkText } from './chunk.ts'
import type { CorpusFile } from './corpus.ts'
import type { Ollama } from './ollama.ts'
import type { IndexStore } from './store.ts'

export interface BuildSummary {
  added: number
  updated: number
  removed: number
  unchanged: number
  // Chunks embedded by this run, not the size of the index.
  chunks: number
}

interface BuildContext {
  store: IndexStore
  ollama: Ollama
  known: Map<string, { label: string; hash: string }>
  summary: BuildSummary
}

function removeDeleted(context: BuildContext, files: CorpusFile[]): void {
  const current = new Set(files.map((file) => file.path))
  for (const path of context.known.keys()) {
    if (current.has(path)) continue
    context.store.removeFile(path)
    context.summary.removed += 1
  }
}

// Embeds and stores one file unless it is unchanged; returns the dimension
// of the vectors it embedded, if it embedded any.
async function indexFile(context: BuildContext, file: CorpusFile): Promise<number | undefined> {
  const text = readFileSync(file.path, 'utf8')
  const hash = createHash('sha256').update(text).digest('hex')
  const before = context.known.get(file.path)
  if (before?.hash === hash && before.label === file.label) {
    context.summary.unchanged += 1
    return undefined
  }
  const chunks = chunkText(text)
  const vectors = await context.ollama.embed(chunks)
  context.store.replaceFile(
    { ...file, hash },
    chunks.map((chunk, i) => ({ text: chunk, vector: vectors[i] })),
  )
  context.summary[before ? 'updated' : 'added'] += 1
  context.summary.chunks += chunks.length
  return vectors[0]?.length
}

export function formatBuildSummary(summary: BuildSummary, skipped: string[]): string[] {
  const { added, updated, removed, unchanged, chunks } = summary
  const lines = [`added ${added}, updated ${updated}, removed ${removed}, unchanged ${unchanged}; ${chunks} chunks embedded`]
  if (skipped.length === 0) return lines
  return [...lines, 'skipped, not .txt or .md:', ...skipped.map((path) => `  ${path}`)]
}

// A different model wipes the index. The model is recorded only once every
// file is in, so an interrupted model change leaves an index search refuses.
export async function buildIndex(options: {
  files: CorpusFile[]
  store: IndexStore
  ollama: Ollama
  model: string
}): Promise<BuildSummary> {
  const { files, store, model } = options
  if (store.readMeta()?.model !== model) store.resetIndex()
  const context: BuildContext = {
    store,
    ollama: options.ollama,
    known: store.fileHashes(),
    summary: { added: 0, updated: 0, removed: 0, unchanged: 0, chunks: 0 },
  }
  removeDeleted(context, files)
  let dimensions = store.readMeta()?.dimensions ?? 0
  for (const file of files) dimensions = (await indexFile(context, file)) ?? dimensions
  store.completeBuild(model, dimensions)
  return context.summary
}

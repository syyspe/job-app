import { CliError } from '../../lib/cliError.ts'
import type { Label } from './config.ts'
import type { Ollama } from './ollama.ts'
import { openReadonlyIndex, REBUILD_HINT } from './store.ts'
import type { IndexReader } from './store.ts'

export interface SearchRequest {
  query: string
  label?: Label
  limit: number
}

export interface SearchResult {
  source: string
  label: Label
  text: string
  score: number
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0
}

function refuse(reason: string): CliError {
  return new CliError(1, `${reason}: ${REBUILD_HINT}`)
}

function checkModel(index: IndexReader, model: string): number {
  const meta = index.readMeta()
  if (!meta) throw refuse('the profile index has no completed build')
  if (meta.model !== model) throw refuse('the profile index was built with a different embedding model')
  return meta.dimensions
}

export async function searchIndex(
  deps: { index: IndexReader; ollama: Ollama; model: string },
  request: SearchRequest,
): Promise<SearchResult[]> {
  const dimensions = checkModel(deps.index, deps.model)
  const chunks = deps.index.allChunks(request.label)
  if (chunks.length === 0) return []
  const [query] = await deps.ollama.embed([request.query])
  if (query.length !== dimensions) throw refuse('the profile index has a different vector dimension')
  return chunks
    .map((chunk) => ({ source: chunk.source, label: chunk.label, text: chunk.text, score: cosine(query, chunk.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, request.limit)
}

// Opens the index for one search only, so a rebuild between calls is seen and
// a missing index refuses per call rather than at startup.
export async function searchIndexFile(
  indexFile: string,
  deps: { ollama: Ollama; model: string },
  request: SearchRequest,
): Promise<SearchResult[]> {
  const index = openReadonlyIndex(indexFile)
  try {
    return await searchIndex({ index, ...deps }, request)
  } finally {
    index.close()
  }
}

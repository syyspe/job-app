import { z } from 'zod'
import { CliError } from '../../lib/cliError.ts'
import type { ProfileConfig } from './config.ts'

const BATCH_SIZE = 16
const EMBED_TIMEOUT_MS = 120_000
const HEALTH_TIMEOUT_MS = 3_000

export interface Ollama {
  embed: (texts: string[]) => Promise<number[][]>
}

export type HealthResult = { ok: true } | { ok: false; reason: 'unreachable' | 'bad_response' | 'model_missing' }

const embedSchema = z.object({ embeddings: z.array(z.array(z.number())) })
const tagsSchema = z.object({ models: z.array(z.object({ name: z.string() })) })

function embedFailure(detail: string, cause?: unknown): CliError {
  return new CliError(1, `Ollama embedding failed: ${detail}`, { cause })
}

async function postEmbed(url: string, body: unknown): Promise<Response> {
  try {
    return await fetch(new URL('/api/embed', url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
    })
  } catch (err) {
    throw embedFailure('unreachable', err)
  }
}

async function embedBatch(url: string, model: string, input: string[]): Promise<number[][]> {
  const response = await postEmbed(url, { model, input })
  if (!response.ok) throw embedFailure(String(response.status))
  const parsed = embedSchema.safeParse(await response.json().catch(() => undefined))
  if (!parsed.success || parsed.data.embeddings.length !== input.length) throw embedFailure('bad response')
  return parsed.data.embeddings
}

export function createOllama(options: { url: string; model: string }): Ollama {
  return {
    embed: async (texts) => {
      const vectors: number[][] = []
      for (let start = 0; start < texts.length; start += BATCH_SIZE) {
        vectors.push(...(await embedBatch(options.url, options.model, texts.slice(start, start + BATCH_SIZE))))
      }
      if (vectors.some((vector) => vector.length !== vectors[0].length)) throw embedFailure('bad response')
      return vectors
    },
  }
}

// Returns rather than throws: the runner recovers from an unhealthy endpoint
// by skipping evaluation and drafting.
export async function checkOllama(
  config: Pick<ProfileConfig, 'ollamaUrl' | 'embeddingModel'>,
): Promise<HealthResult> {
  let response: Response
  try {
    response = await fetch(new URL('/api/tags', config.ollamaUrl), {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    })
  } catch {
    return { ok: false, reason: 'unreachable' }
  }
  const parsed = tagsSchema.safeParse(await response.json().catch(() => undefined))
  if (!response.ok || !parsed.success) return { ok: false, reason: 'bad_response' }
  const names = parsed.data.models.map((entry) => entry.name)
  const model = config.embeddingModel
  if (names.includes(model) || names.includes(`${model}:latest`)) return { ok: true }
  return { ok: false, reason: 'model_missing' }
}

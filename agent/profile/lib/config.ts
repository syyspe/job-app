import { readFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { z } from 'zod'
import { CliError } from '../../lib/cliError.ts'

export const LABELS = ['facts', 'style'] as const
export type Label = (typeof LABELS)[number]

const absolutePath = z.string().refine(isAbsolute, 'must be an absolute path')

const configSchema = z.object({
  ollamaUrl: z.url({ protocol: /^https?$/, error: 'must be an http or https URL' }),
  embeddingModel: z.string().min(1),
  corpus: z
    .array(
      z.object({
        path: absolutePath,
        label: z.enum(LABELS),
      }),
    )
    .min(1),
  syncFolder: absolutePath.optional(),
})

export type ProfileConfig = z.infer<typeof configSchema>
export type CorpusEntry = ProfileConfig['corpus'][number]

export function readConfigFile(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    throw new CliError(2, `${path}: file not found`, { cause: err })
  }
}

function parseJson(path: string, text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (err) {
    throw new CliError(2, `${path}: invalid JSON`, { cause: err })
  }
}

function withSyncFolder(config: ProfileConfig): ProfileConfig {
  if (!config.syncFolder) return config
  return { ...config, corpus: [...config.corpus, { path: config.syncFolder, label: 'style' }] }
}

// Reads only the keys this stream owns; other keys in the file are ignored.
// A syncFolder joins the corpus as a style entry, so every command indexes it.
export function loadProfileConfig(path: string): ProfileConfig {
  const result = configSchema.safeParse(parseJson(path, readConfigFile(path)))
  if (result.success) return withSyncFolder(result.data)
  const [issue] = result.error.issues
  const field = issue.path.map((part) => (typeof part === 'number' ? `[${part}]` : `.${String(part)}`))
  throw new CliError(2, `${path}: ${field.join('').slice(1) || '(root)'}: ${issue.message}`)
}

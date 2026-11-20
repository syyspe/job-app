import { z } from 'zod'
import { CliError } from '../../lib/cliError.ts'
import { absolutePath, parseConfigFile } from '../../profile/lib/config.ts'
import type { SourceConnector } from './sources/types.ts'

const runnerConfigSchema = z.object({
  titleRules: z.object({ reject: z.array(z.string().min(1)).default([]) }).default({ reject: [] }),
  evaluation: z
    .object({
      concurrency: z.int().min(1).max(8).default(2),
      perRunCap: z.int().min(1).default(10),
      timeoutMs: z.int().min(1).default(300000),
    })
    .default({ concurrency: 2, perRunCap: 10, timeoutMs: 300000 }),
})

const draftConfigSchema = z.object({
  drafting: z.object({
    concurrency: z.int().min(1).max(4).default(1),
    perRunCap: z.int().min(1).default(3),
    timeoutMs: z.int().min(1).default(600000),
    filePrefix: z.string().min(1),
    cvTemplates: z.object({ fi: absolutePath, en: absolutePath }),
  }),
})

export type RunnerConfig = z.infer<typeof runnerConfigSchema>
export type DraftConfig = z.infer<typeof draftConfigSchema>['drafting']

// The keys of config.json the runner owns; every other key is ignored.
export function loadRunnerConfig(path: string): RunnerConfig {
  return parseConfigFile(path, runnerConfigSchema)
}

// Only agent:draft reads the drafting key, so agent:evaluate runs without it.
export function loadDraftConfig(path: string): DraftConfig {
  return parseConfigFile(path, draftConfigSchema).drafting
}

const sourceSchema = z.object({
  enabled: z.boolean(),
  termsCheckedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD').optional(),
  dailyOpenCap: z.int().min(1).default(20),
  minDelayMs: z.int().min(1000).default(15000),
})

const sourcesConfigSchema = z.object({ sources: z.record(z.string(), sourceSchema).default({}) })

export type SourceConfig = z.infer<typeof sourceSchema>
export type SourcesConfig = Record<string, SourceConfig>

const DISABLED: SourceConfig = { enabled: false, dailyOpenCap: 20, minDelayMs: 15000 }

// Every connector gets an entry; one missing from config is disabled.
export function loadSourcesConfig(path: string, connectors: Pick<SourceConnector, 'id' | 'mode'>[]): SourcesConfig {
  const { sources } = parseConfigFile(path, sourcesConfigSchema)
  const unknown = Object.keys(sources).find((id) => !connectors.some((connector) => connector.id === id))
  if (unknown) throw new CliError(2, `${path}: sources.${unknown}: unknown source`)
  const config: SourcesConfig = {}
  for (const { id, mode } of connectors) {
    config[id] = sources[id] ?? DISABLED
    if (mode === 'automatic' && config[id].enabled && !config[id].termsCheckedOn) {
      throw new CliError(2, `${path}: sources.${id}: termsCheckedOn is required to enable an automatic source`)
    }
  }
  if (!Object.values(config).some((source) => source.enabled)) {
    throw new CliError(2, `${path}: sources: no source is enabled`)
  }
  return config
}

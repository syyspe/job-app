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
  prescreen: z
    .object({
      concurrency: z.int().min(1).max(8).default(4),
      perRunCap: z.int().min(1).default(40),
      timeoutMs: z.int().min(1).default(120000),
    })
    .default({ concurrency: 4, perRunCap: 40, timeoutMs: 120000 }),
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

const dailyRunConfigSchema = z.object({
  handoverWaitDays: z.int().min(1).default(7),
  summary: z.object({
    recipient: z.email(),
    alwaysSend: z.boolean().default(false),
    lanUrl: z.url({ protocol: /^https?$/, error: 'must be an http or https URL' }).optional(),
  }),
})

export type DailyRunConfig = z.infer<typeof dailyRunConfigSchema>

// Only agent:run reads these keys.
export function loadDailyRunConfig(path: string): DailyRunConfig {
  return parseConfigFile(path, dailyRunConfigSchema)
}

const sourceSchema = z.object({
  enabled: z.boolean(),
  termsCheckedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD').optional(),
  dailyOpenCap: z.int().min(1).default(20),
  minDelayMs: z.int().min(1000).default(15000),
  // Read only for a hand-over connector with a fetchAd: fetch on the user's
  // click alone, or also every ad the pre-screen calls promising.
  fetch: z.enum(['requested', 'automatic']).default('requested'),
})

const sourcesConfigSchema = z.object({ sources: z.record(z.string(), sourceSchema).default({}) })

export type SourceConfig = z.infer<typeof sourceSchema>
export type SourcesConfig = Record<string, SourceConfig>

const DISABLED: SourceConfig = { enabled: false, dailyOpenCap: 20, minDelayMs: 15000, fetch: 'requested' }

// Every connector gets an entry; one missing from config is disabled.
export function loadSourcesConfig(path: string, connectors: Pick<SourceConnector, 'id' | 'fetchAd'>[]): SourcesConfig {
  const { sources } = parseConfigFile(path, sourcesConfigSchema)
  const unknown = Object.keys(sources).find((id) => !connectors.some((connector) => connector.id === id))
  if (unknown) throw new CliError(2, `${path}: sources.${unknown}: unknown source`)
  const config: SourcesConfig = {}
  for (const { id, fetchAd } of connectors) {
    config[id] = sources[id] ?? DISABLED
    if (fetchAd && config[id].enabled && !config[id].termsCheckedOn) {
      throw new CliError(2, `${path}: sources.${id}: termsCheckedOn is required to enable a source that fetches`)
    }
  }
  if (!Object.values(config).some((source) => source.enabled)) {
    throw new CliError(2, `${path}: sources: no source is enabled`)
  }
  return config
}

const STEPS = ['prescreen', 'evaluation', 'drafting'] as const
const effort = z.enum(['low', 'medium', 'high'])

const priceSchema = z.object({
  inputPerMTok: z.number().min(0),
  outputPerMTok: z.number().min(0),
  cacheWritePerMTok: z.number().min(0),
  cacheReadPerMTok: z.number().min(0),
})

const DEFAULT_MODELS = { prescreen: 'claude-haiku-5-5', evaluation: 'claude-sonnet-5-5', drafting: 'claude-opus-5-5' }
const DEFAULT_EFFORT = { prescreen: 'low', evaluation: 'medium', drafting: 'high' } as const

const engineConfigSchema = z.object({
  engine: z.enum(['cli', 'api']).default('cli'),
  api: z
    .object({
      models: z
        .object({
          prescreen: z.string().min(1).default(DEFAULT_MODELS.prescreen),
          evaluation: z.string().min(1).default(DEFAULT_MODELS.evaluation),
          drafting: z.string().min(1).default(DEFAULT_MODELS.drafting),
        })
        .default(DEFAULT_MODELS),
      effort: z
        .object({
          prescreen: effort.default(DEFAULT_EFFORT.prescreen),
          evaluation: effort.default(DEFAULT_EFFORT.evaluation),
          drafting: effort.default(DEFAULT_EFFORT.drafting),
        })
        .default(DEFAULT_EFFORT),
      perRunUsd: z.number().positive().default(3),
      prices: z.record(z.string(), priceSchema).default({}),
    })
    .default({ models: DEFAULT_MODELS, effort: DEFAULT_EFFORT, perRunUsd: 3, prices: {} }),
})

export type EngineConfig = z.infer<typeof engineConfigSchema>
export type ApiConfig = EngineConfig['api']
export type ModelPrice = z.infer<typeof priceSchema>

// Under "api" every model in use needs a price, so the run cap never runs blind.
export function loadEngineConfig(path: string): EngineConfig {
  const config = parseConfigFile(path, engineConfigSchema)
  if (config.engine !== 'api') return config
  const unpriced = STEPS.map((step) => config.api.models[step]).find((model) => !config.api.prices[model])
  if (unpriced) throw new CliError(2, `${path}: api.prices.${unpriced}: no price for a model api.models names`)
  return config
}

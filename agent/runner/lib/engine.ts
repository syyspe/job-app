import { join } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { configPath, envPath, indexPath, stateDir } from '../../lib/paths.ts'
import type { Env } from '../../lib/paths.ts'
import type { ProfileConfig } from '../../profile/lib/config.ts'
import { createOllama } from '../../profile/lib/ollama.ts'
import { searchIndexFile } from '../../profile/lib/search.ts'
import type { SearchRequest, SearchResult } from '../../profile/lib/search.ts'
import { createRunBudget, UNLIMITED } from './apiBudget.ts'
import type { StepBudget } from './apiBudget.ts'
import { createSpendLedger } from './apiSpend.ts'
import { createApiStep } from './apiStep.ts'
import type { MessagesApi } from './apiStep.ts'
import { loadApiKey } from './env.ts'
import type { RunStep } from './evaluate.ts'
import { loadEngineConfig } from './runnerConfig.ts'
import type { ApiConfig, EngineConfig } from './runnerConfig.ts'
import { runSandboxed } from './sandbox.ts'

const CLAUDE_BIN = 'claude'

export type ModelStep = 'prescreen' | 'evaluation' | 'drafting'

export interface StepSpec {
  step: ModelStep
  prompt: string
  systemPrompt: string
  schema: Record<string, unknown>
  timeoutMs: number
}

export interface Engine {
  kind: 'cli' | 'api'
  budget: StepBudget
  stepFor(spec: StepSpec): RunStep
}

export interface EngineDeps {
  // The runner's own environment, for the sandboxed CLI step.
  env: Env
  // The runner's env file, holding ANTHROPIC_API_KEY under "api".
  envFile: string
  // Where the month's API spend is kept, in api-spend.json.
  stateDir: string
  searchProfile: (request: SearchRequest) => Promise<SearchResult[]>
  // Tests only: stands in for the SDK client.
  messages?: MessagesApi
}

function cliEngine(env: Env): Engine {
  return {
    kind: 'cli',
    budget: UNLIMITED,
    stepFor: ({ prompt, systemPrompt, schema, timeoutMs }) => {
      return (input) => runSandboxed({ claudeBin: CLAUDE_BIN, prompt, systemPrompt, schema, input, timeoutMs, env })
    },
  }
}

function apiEngine(api: ApiConfig, deps: EngineDeps): Engine {
  const apiKey = loadApiKey(deps.envFile)
  const messages = deps.messages ?? new Anthropic({ apiKey }).messages
  const ledger = createSpendLedger(join(deps.stateDir, 'api-spend.json'), () => new Date())
  const { perRunUsd, monthlyUsd, prices } = api
  const budget = createRunBudget({ perRunUsd, monthlyUsd, prices, ledger })
  return {
    kind: 'api',
    budget,
    stepFor: ({ step, ...spec }) => {
      const model = api.models[step]
      const effort = api.effort[step]
      return createApiStep({ ...spec, messages, model, effort, searchProfile: deps.searchProfile, budget })
    },
  }
}

// Builds objects only, with no network, so a command can call it before
// taking the lock.
export function createEngine(config: EngineConfig, deps: EngineDeps): Engine {
  if (config.engine === 'api') return apiEngine(config.api, deps)
  return cliEngine(deps.env)
}

// The engine the commands run on: config's engine key, with search_profile
// answered in-process from the local index and the configured Ollama.
export function loadEngine(env: Env, profile: ProfileConfig): Engine {
  const indexFile = indexPath(env)
  const search = { ollama: createOllama({ url: profile.ollamaUrl, model: profile.embeddingModel }), model: profile.embeddingModel }
  const searchProfile = (request: SearchRequest) => searchIndexFile(indexFile, search, request)
  return createEngine(loadEngineConfig(configPath(env)), {
    env,
    envFile: envPath(env),
    stateDir: stateDir(env),
    searchProfile,
  })
}

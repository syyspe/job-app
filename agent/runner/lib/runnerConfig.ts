import { z } from 'zod'
import { absolutePath, parseConfigFile } from '../../profile/lib/config.ts'

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

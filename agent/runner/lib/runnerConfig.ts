import { z } from 'zod'
import { parseConfigFile } from '../../profile/lib/config.ts'

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

export type RunnerConfig = z.infer<typeof runnerConfigSchema>

// The keys of config.json the runner owns; every other key is ignored.
export function loadRunnerConfig(path: string): RunnerConfig {
  return parseConfigFile(path, runnerConfigSchema)
}

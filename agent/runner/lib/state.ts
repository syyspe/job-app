import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { CliError } from '../../lib/cliError.ts'

const watermarkSchema = z.object({ uidValidity: z.number(), lastUid: z.number() })
const countersSchema = z.object({
  date: z.string(),
  opened: z.record(z.string(), z.int()),
  blocked: z.array(z.string()),
})
const failuresSchema = z.array(
  z.object({ source: z.string(), date: z.string(), kind: z.enum(['blocked', 'empty_alert']) }),
)

export type Watermark = z.infer<typeof watermarkSchema>
export type SourceFailure = z.infer<typeof failuresSchema>[number]
type CounterFile = z.infer<typeof countersSchema>

// One day's page opens and blocks per source. Each change re-reads and
// rewrites the file, so sources fetching in parallel never lose a count.
export interface DailyCounters {
  opened: (source: string) => number
  isBlocked: (source: string) => boolean
  countOpen: (source: string) => void
  markBlocked: (source: string) => void
}

export interface RunnerState {
  readWatermark: () => Watermark
  writeWatermark: (watermark: Watermark) => void
  counters: (today: string) => DailyCounters
  readFailures: () => SourceFailure[]
  addFailure: (failure: SourceFailure) => void
  // Drops the failures a sent summary covered; any added since stay.
  removeFailures: (reported: SourceFailure[]) => void
}

// The local calendar date, YYYY-MM-DD: daily caps follow the user's day.
export function localDate(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err
    return undefined
  }
}

function readState<T>(path: string, schema: z.ZodType<T>, missing: T): T {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    return missing
  }
  const parsed = schema.safeParse(parseJson(text))
  if (!parsed.success) throw new CliError(2, `${path}: not a valid state file; fix or delete it`)
  return parsed.data
}

// A temp file and a rename, so a crash never leaves a half-written file.
function writeState(path: string, value: unknown): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(`${path}.tmp`, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(`${path}.tmp`, path)
}

function dailyCounters(path: string, today: string): DailyCounters {
  const read = (): CounterFile => {
    const stored = readState(path, countersSchema, { date: today, opened: {}, blocked: [] })
    return stored.date === today ? stored : { date: today, opened: {}, blocked: [] }
  }
  return {
    opened: (source) => read().opened[source] ?? 0,
    isBlocked: (source) => read().blocked.includes(source),
    countOpen: (source) => {
      const file = read()
      writeState(path, { ...file, opened: { ...file.opened, [source]: (file.opened[source] ?? 0) + 1 } })
    },
    markBlocked: (source) => {
      const file = read()
      writeState(path, { ...file, blocked: [...new Set([...file.blocked, source])] })
    },
  }
}

function sameFailure(a: SourceFailure, b: SourceFailure): boolean {
  return a.source === b.source && a.date === b.date && a.kind === b.kind
}

export function createRunnerState(dir: string): RunnerState {
  const watermarkPath = join(dir, 'mail-watermark.json')
  const failuresPath = join(dir, 'source-failures.json')
  return {
    readWatermark: () => readState(watermarkPath, watermarkSchema, { uidValidity: 0, lastUid: 0 }),
    writeWatermark: (watermark) => writeState(watermarkPath, watermark),
    counters: (today) => dailyCounters(join(dir, 'source-counters.json'), today),
    readFailures: () => readState(failuresPath, failuresSchema, []),
    addFailure: (failure) => writeState(failuresPath, [...readState(failuresPath, failuresSchema, []), failure]),
    removeFailures: (reported) => {
      const kept = readState(failuresPath, failuresSchema, []).filter(
        (failure) => !reported.some((covered) => sameFailure(failure, covered)),
      )
      writeState(failuresPath, kept)
    },
  }
}

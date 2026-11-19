import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { indexPath } from '../lib/paths.ts'
import { buildIndex } from '../profile/lib/build.ts'
import type { ProfileConfig } from '../profile/lib/config.ts'
import { listCorpusFiles } from '../profile/lib/corpus.ts'
import { createOllama } from '../profile/lib/ollama.ts'
import { openIndex } from '../profile/lib/store.ts'
import { startFakeOllama } from './fakeOllama.ts'
import type { FakeOllama } from './fakeOllama.ts'
import { makeTempDir } from './tempDir.ts'
import type { TempDir } from './tempDir.ts'

export interface ProfileFixture {
  dir: TempDir
  fake: FakeOllama
  env: Record<string, string>
  config: ProfileConfig
}

export interface RunResult {
  status: number | null
  stdout: string
  stderr: string
}

export function writeConfig(fixture: ProfileFixture, value: unknown): void {
  fixture.dir.write('.config/job-agent/config.json', JSON.stringify(value))
}

// A temp HOME with a synthetic corpus and a config pointing at a fake Ollama.
export async function startProfileFixture(): Promise<ProfileFixture> {
  const dir = makeTempDir()
  const fake = await startFakeOllama()
  dir.write('corpus/facts/cv.md', 'Led the migration of a billing system to PostgreSQL.')
  dir.write('corpus/style/letter.md', 'I would love to bring my experience to your team.')
  const config: ProfileConfig = {
    ollamaUrl: fake.url,
    embeddingModel: 'test-embed',
    corpus: [
      { path: join(dir.root, 'corpus/facts'), label: 'facts' },
      { path: join(dir.root, 'corpus/style'), label: 'style' },
    ],
  }
  const fixture = { dir, fake, env: { PATH: process.env.PATH ?? '', HOME: dir.root }, config }
  writeConfig(fixture, config)
  return fixture
}

export async function closeProfileFixture(fixture: ProfileFixture): Promise<void> {
  await fixture.fake.close()
  fixture.dir.remove()
}

export async function buildFixtureIndex(fixture: ProfileFixture): Promise<void> {
  const { config } = fixture
  const store = openIndex(indexPath(fixture.env))
  const ollama = createOllama({ url: config.ollamaUrl, model: config.embeddingModel })
  await buildIndex({ files: listCorpusFiles(config.corpus).files, store, ollama, model: config.embeddingModel })
  store.close()
}

// Async, unlike spawnSync, so the fake Ollama in this process can answer.
export function runNode(script: string, args: string[], env: Record<string, string>): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], { env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (data: Buffer) => (stdout += data.toString()))
    child.stderr.on('data', (data: Buffer) => (stderr += data.toString()))
    child.on('close', (status) => resolve({ status, stdout, stderr }))
  })
}

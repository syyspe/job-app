import { readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { buildIndex, formatBuildSummary } from '../../profile/lib/build.ts'
import type { BuildSummary } from '../../profile/lib/build.ts'
import type { ProfileConfig } from '../../profile/lib/config.ts'
import { listCorpusFiles } from '../../profile/lib/corpus.ts'
import type { Ollama } from '../../profile/lib/ollama.ts'
import type { IndexStore } from '../../profile/lib/store.ts'
import type { JobAppClient, PendingAttachment } from './jobApp.ts'

export interface SyncOptions {
  jobApp: JobAppClient
  config: ProfileConfig & { syncFolder: string }
  store: IndexStore
  ollama: Ollama
}

export interface SyncResult {
  synced: string[]
  build: BuildSummary
  skipped: string[]
  // Copies whose mark was kept: the file was replaced after it was listed.
  changed: string[]
}

// basename() drops any directory part, so the copy cannot leave the folder.
function copyName(attachment: PendingAttachment): string {
  const safe = basename(attachment.originalName).replace(/[^A-Za-z0-9._-]/g, '_')
  return `${attachment.id}-${safe}`
}

// Any earlier copy of the attachment goes first, so a renamed upload replaces it.
function writeCopy(folder: string, attachment: PendingAttachment, bytes: Uint8Array): string {
  for (const name of readdirSync(folder)) {
    if (name.startsWith(`${attachment.id}-`)) rmSync(join(folder, name))
  }
  const name = copyName(attachment)
  writeFileSync(join(folder, name), bytes)
  return name
}

// No health check here: the caller checks Ollama once for everything it runs.
// Marks are cleared only after the build, so a failed run is retried in full.
export async function syncProfile({ jobApp, config, store, ollama }: SyncOptions): Promise<SyncResult> {
  const pending = await jobApp.listPendingSync()
  const synced: string[] = []
  for (const attachment of pending) {
    synced.push(writeCopy(config.syncFolder, attachment, await jobApp.downloadAttachment(attachment.id)))
  }
  const { files, skipped } = listCorpusFiles(config.corpus)
  const build = await buildIndex({ files, store, ollama, model: config.embeddingModel })
  const changed: string[] = []
  for (const [index, attachment] of pending.entries()) {
    const cleared = await jobApp.clearProfileSync(attachment.id, attachment.storedName)
    if (!cleared) changed.push(synced[index])
  }
  return { synced, build, skipped, changed }
}

export function formatSyncResult({ synced, build, skipped, changed }: SyncResult): string[] {
  return [
    `synced ${synced.length} attachments`,
    ...synced.map((name) => `  ${name}`),
    ...formatBuildSummary(build, skipped),
    ...changed.map((name) => `kept marked (changed during sync): ${name}`),
  ]
}

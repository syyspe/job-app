// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest'
import { fakeVector, startFakeOllama, UNREACHABLE_URL } from '../../test/fakeOllama.ts'
import type { FakeOllama } from '../../test/fakeOllama.ts'
import { checkOllama, createOllama } from './ollama.ts'

let fake: FakeOllama

beforeEach(async () => {
  fake = await startFakeOllama()
})

afterEach(async () => {
  await fake.close()
})

function ollama(url = fake.url) {
  return createOllama({ url, model: 'test-embed' })
}

test('embed sends batches of 16 and keeps the input order', async () => {
  const texts = Array.from({ length: 40 }, (_, i) => `text number ${i}`)

  const vectors = await ollama().embed(texts)

  expect(fake.embedRequests).toBe(3)
  expect(vectors).toEqual(texts.map(fakeVector))
})

test('embed of nothing makes no request', async () => {
  expect(await ollama().embed([])).toEqual([])
  expect(fake.embedRequests).toBe(0)
})

test.each([
  ['status', 'Ollama embedding failed: 500'],
  ['malformed', 'Ollama embedding failed: bad response'],
  ['wrongCount', 'Ollama embedding failed: bad response'],
] as const)('an embed %s failure is an exit-1 error', async (failure, message) => {
  fake.failure = failure

  await expect(ollama().embed(['a', 'b'])).rejects.toMatchObject({ exitCode: 1, message })
})

test('an unreachable endpoint fails embedding as unreachable', async () => {
  await expect(ollama(UNREACHABLE_URL).embed(['a'])).rejects.toMatchObject({
    exitCode: 1,
    message: 'Ollama embedding failed: unreachable',
  })
})

test('health is ok when the model is pulled, with or without :latest', async () => {
  fake.models = ['other:7b', 'test-embed:latest']

  expect(await checkOllama({ ollamaUrl: fake.url, embeddingModel: 'test-embed' })).toEqual({ ok: true })
  expect(await checkOllama({ ollamaUrl: fake.url, embeddingModel: 'test-embed:latest' })).toEqual({ ok: true })
})

test('health reports a model that is not pulled', async () => {
  expect(await checkOllama({ ollamaUrl: fake.url, embeddingModel: 'absent' })).toEqual({
    ok: false,
    reason: 'model_missing',
  })
})

test.each(['status', 'malformed'] as const)('health reports a %s tags answer as bad_response', async (failure) => {
  fake.tagsFailure = failure

  expect(await checkOllama({ ollamaUrl: fake.url, embeddingModel: 'test-embed' })).toEqual({
    ok: false,
    reason: 'bad_response',
  })
})

test('health reports a closed endpoint as unreachable', async () => {
  expect(await checkOllama({ ollamaUrl: UNREACHABLE_URL, embeddingModel: 'test-embed' })).toEqual({
    ok: false,
    reason: 'unreachable',
  })
})

test('health reports a timeout as unreachable', async () => {
  fake.tagsFailure = 'hang'

  expect(await checkOllama({ ollamaUrl: fake.url, embeddingModel: 'test-embed' })).toEqual({
    ok: false,
    reason: 'unreachable',
  })
}, 10_000)

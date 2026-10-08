import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateListing, proposalApprovalError, semanticDecision, QUESTIONS } from '../packages/shared/src/evaluation.js'

const source = { title: 'Blue ceramic mug', description: 'A blue ceramic mug, 300 ml.', tags: ['ceramic mug'] }
const input = { source, candidate: { ...source, tags: ['blue mug'] } }
const response = (answers: unknown, model = 'jev-1.13.0') => new Response(JSON.stringify({ model, answers }))
const answers = { relevant: { type: 'noul', noul: 0.95 }, supported: { type: 'noul', noul: 0.96 }, stuffing: { type: 'noul', noul: 0.03 } }

test('rules do not fabricate semantic probabilities or auto-approve', async () => {
  const result = await evaluateListing(input)
  assert.equal(result.decision, 'needs_review')
  assert.equal(result.probabilities, null)
  assert.equal(result.model, null)
})

test('duplicate tags, too many tags, and unresolved placeholders block without calling Jev', async () => {
  for (const candidate of [
    { ...source, tags: ['Mug', ' mug '] },
    { ...source, tags: Array.from({ length: 14 }, (_, i) => `tag ${i}`) },
    { ...source, description: '{{material}} mug' }
  ]) {
    const result = await evaluateListing({ source, candidate }, {
      provider: 'jev', fetcher: async () => { throw new Error('must not be called') }
    })
    assert.equal(result.decision, 'blocked')
    assert.equal(result.status, 'completed')
    assert.ok(result.checks.errors.length)
  }
})

test('Jev request uses official endpoint, typed questions and separate source evidence', async () => {
  const result = await evaluateListing(input, {
    provider: 'jev', apiKey: 'test-key',
    fetcher: async (url, options) => {
      assert.equal(url, 'https://api.typesafe.ai/v1/systemone')
      assert.deepEqual(JSON.parse(String(options?.body)), { model: 'jev-1.13.0', state: input, questions: QUESTIONS })
      assert.equal((options?.headers as Record<string, string>).Authorization, 'Bearer test-key')
      return response(answers)
    }
  })
  assert.equal(result.decision, 'ready_for_review')
  assert.equal(result.model, 'jev-1.13.0')
  assert.equal(result.probabilities?.supported, 0.96)
  assert.ok(result.rubricVersion)
})

test('threshold boundaries and each failing dimension route for review', () => {
  assert.equal(semanticDecision({ relevant: 0.8, supported: 0.8, stuffing: 0.2 }), 'ready_for_review')
  for (const p of [
    { relevant: 0.79, supported: 0.9, stuffing: 0.1 },
    { relevant: 0.9, supported: 0.79, stuffing: 0.1 },
    { relevant: 0.9, supported: 0.9, stuffing: 0.21 }
  ]) assert.equal(semanticDecision(p), 'needs_review')
})

test('fixture labels and extra metadata never reach the judge', async () => {
  const labelled = { ...input, expectedJev: 'ready_for_review', privateMetadata: 'not evidence' }
  await evaluateListing(labelled, { provider: 'jev', apiKey: 'test-key', fetcher: async (_url, options) => {
    const request = JSON.parse(String(options?.body))
    assert.deepEqual(Object.keys(request.state).sort(), ['candidate', 'source'])
    return response(answers)
  } })
})

test('missing key, HTTP errors, timeout and malformed answers require manual review', async () => {
  const fetchers: Array<typeof fetch | undefined> = [
    undefined,
    async () => new Response('secret-provider-body', { status: 429 }),
    async () => { throw new DOMException('timeout', 'TimeoutError') },
    async () => response({}),
    async () => response({ ...answers, relevant: { type: 'noul', noul: 1.1 } }),
    async () => response({ ...answers, supported: { type: 'score', noul: 0.9 } })
  ]
  for (const fetcher of fetchers) {
    const result = await evaluateListing(input, { provider: 'jev', apiKey: fetcher ? 'test-key' : undefined, fetcher })
    assert.equal(result.status, 'unavailable')
    assert.equal(result.decision, 'needs_review')
    assert.equal(result.probabilities, null)
    assert.equal(JSON.stringify(result).includes('secret-provider-body'), false)
  }
})

test('approval rejects legacy and blocked proposals and requires explicit acknowledgement', async () => {
  assert.ok(proposalApprovalError({}, true))
  const evaluation = await evaluateListing(input)
  assert.ok(proposalApprovalError({ evaluation }, false))
  assert.equal(proposalApprovalError({ evaluation }, true), null)
  assert.ok(proposalApprovalError({ evaluation: { ...evaluation, decision: 'blocked' } }, true))
})

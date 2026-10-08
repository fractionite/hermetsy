import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { evaluateListing, RUBRIC_VERSION, type EvaluationInput } from '../packages/shared/src/evaluation.js'

async function main() {
  const provider = process.argv.includes('--jev') ? 'jev' : 'rules'
  if (provider === 'jev' && !process.env.TYPESAFE_API_KEY) throw new Error('Set TYPESAFE_API_KEY before running --jev.')
  const cases = JSON.parse(await readFile(new URL('../evals/listing-cases.json', import.meta.url), 'utf8')) as Array<
    EvaluationInput & { id: string; expectedRules: string; expectedJev: string }
  >
  const rows = []
  for (const item of cases) {
    const evaluation = await evaluateListing({ source: item.source, candidate: item.candidate }, { provider, apiKey: process.env.TYPESAFE_API_KEY, model: process.env.JEV_MODEL })
    const expected = provider === 'jev' ? item.expectedJev : item.expectedRules
    rows.push({ id: item.id, expected, actual: evaluation.decision, matched: evaluation.status === 'completed' && expected === evaluation.decision, evaluation })
  }
  const falseReady = rows.filter(row => row.expected !== 'ready_for_review' && row.actual === 'ready_for_review').length
  const unavailable = rows.filter(row => row.evaluation.status === 'unavailable').length
  console.log(JSON.stringify({
    provider, rubricVersion: RUBRIC_VERSION, cases: rows.length,
    matched: rows.filter(row => row.matched).length, falseReady, unavailable,
    note: 'Six synthetic fixtures are a smoke test, not evidence of sales lift or real-world calibration.', rows
  }, null, 2))
  if (rows.some(row => !row.matched)) process.exitCode = 1
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })

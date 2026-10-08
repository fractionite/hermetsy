'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Evaluation } from '@etsybot/shared'

type Item = {
  id: string
  etsyListingId: string
  oldTitle: string | null
  newTitle: string | null
  oldDescription: string | null
  newDescription: string | null
  status: string
  validationErrors: unknown
}

type Operation = {
  id: string
  type: string
  status: string
  totalItems: number
  items: Item[]
  settings: { evaluation?: Evaluation; proposed?: { tags?: string[] } } | null
}

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000'

export default function OperationPage({
  params
}: {
  params: { operationId: string }
}) {
  const [operation, setOperation] = useState<Operation | null>(null)
  const [message, setMessage] = useState('Loading...')
  const [evaluationAcknowledged, setEvaluationAcknowledged] = useState(false)

  async function loadOperation() {
    const response = await fetch(`${apiBase}/api/operations/${params.operationId}`)
    const data = await response.json()
    setOperation(data)
    setMessage('Preview loaded.')
  }

  useEffect(() => {
    void loadOperation()
  }, [])

  async function approve() {
    setMessage('Queued for worker processing...')
    const response = await fetch(`${apiBase}/api/operations/${params.operationId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evaluationAcknowledged })
    })
    if (!response.ok) {
      const error = await response.json()
      setMessage(error.error || 'Approval failed.')
      return
    }
    await loadOperation()
    setMessage('Operation approved and queued.')
  }

  if (!operation) {
    return (
      <main className="shell">
        <section className="hero">
          <h1>Operation</h1>
          <p className="lede">{message}</p>
        </section>
      </main>
    )
  }

  return (
    <main className="shell stack">
      <section className="hero">
        <div className="eyebrow">Operation</div>
        <h1>{operation.type}</h1>
        <p className="lede">
          Status: {operation.status}. Total items: {operation.totalItems}.
        </p>
        <div className="row">
          <button className="button" onClick={approve} disabled={
            !['draft', 'previewed'].includes(operation.status) ||
            (operation.type === 'agent_listing_edit' && (!evaluationAcknowledged || !operation.settings?.evaluation || operation.settings.evaluation.decision === 'blocked'))
          }>
            Approve and Queue
          </button>
          <Link className="button secondary" href="/listings">
            Back to listings
          </Link>
        </div>
        <p className="muted">{message}</p>
      </section>

      {operation.type === 'agent_listing_edit' && (
        <section className="card">
          <h2>Suggestion review</h2>
          {operation.settings?.evaluation ? <>
            <p>{operation.settings.evaluation.decision.replaceAll('_', ' ')}</p>
            <ul>{operation.settings.evaluation.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
            {operation.settings.evaluation.probabilities && <ul>
              <li>Probability keywords match the product: {Math.round(operation.settings.evaluation.probabilities.relevant * 100)}%</li>
              <li>Probability claims are supported: {Math.round(operation.settings.evaluation.probabilities.supported * 100)}%</li>
              <li>Probability of keyword stuffing: {Math.round(operation.settings.evaluation.probabilities.stuffing * 100)}%</li>
            </ul>}
            <p className="muted">These are model estimates. They do not measure search demand or predict sales.</p>
            <label><input type="checkbox" checked={evaluationAcknowledged} onChange={event => setEvaluationAcknowledged(event.target.checked)} /> I have checked the suggestion and its evaluation.</label>
          </> : <p>Create a new proposal to evaluate this suggestion before approval.</p>}
          <p>Proposed tags: {operation.settings?.proposed?.tags?.join(', ') || 'None'}</p>
        </section>
      )}

      <section className="card">
        <h2>Diff preview</h2>
        <div className="stack" style={{ marginTop: 14 }}>
          {operation.items.map((item) => (
            <div key={item.id} className="card" style={{ padding: 16 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>Listing #{item.etsyListingId}</strong>
                <span className={`pill ${item.status === 'invalid' ? 'bad' : 'good'}`}>{item.status}</span>
              </div>
              <div className="grid two" style={{ marginTop: 12 }}>
                <div>
                  <div className="muted">Old title</div>
                  <p>{item.oldTitle || '—'}</p>
                </div>
                <div>
                  <div className="muted">New title</div>
                  <p>{item.newTitle || '—'}</p>
                </div>
              </div>
              <div className="grid two" style={{ marginTop: 12 }}>
                <div>
                  <div className="muted">Old description</div>
                  <p>{item.oldDescription || '—'}</p>
                </div>
                <div>
                  <div className="muted">New description</div>
                  <p>{item.newDescription || '—'}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

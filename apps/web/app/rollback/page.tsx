'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Operation = {
  id: string
  type: string
  status: string
}

type Listing = {
  etsyListingId: string
  title: string | null
}

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000'

export default function RollbackPage() {
  const [shop, setShop] = useState<{ id: string } | null>(null)
  const [operations, setOperations] = useState<Operation[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [sourceOperationId, setSourceOperationId] = useState('')
  const [selectedListings, setSelectedListings] = useState<string[]>([])
  const [message, setMessage] = useState('Ready.')

  async function loadData() {
    const [shopResponse, operationsResponse, listingsResponse] = await Promise.all([
      fetch(`${apiBase}/api/listings/shop`),
      fetch(`${apiBase}/api/operations`),
      fetch(`${apiBase}/api/listings`)
    ])

    const shopData = await shopResponse.json()
    const operationData = await operationsResponse.json()
    const listingData = await listingsResponse.json()
    setShop(shopData)
    setListings(listingData.listings || [])
    setOperations(operationData.operations || [])
  }

  useEffect(() => {
    void loadData()
  }, [])

  async function previewRollback() {
    if (!shop?.id || !sourceOperationId) {
      setMessage('Select a source operation and ensure a shop exists.')
      return
    }

    const response = await fetch(`${apiBase}/api/rollback/preview`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        shopId: shop.id,
        sourceOperationId,
        listingIds: selectedListings
      })
    })

    const data = await response.json()
    setMessage(`Rollback preview created: ${data.operationId}`)
    window.location.href = `/operations/${data.operationId}`
  }

  return (
    <main className="shell stack">
      <section className="hero">
        <div className="eyebrow">Rollback</div>
        <h1>Rewind safely</h1>
        <p className="lede">
          Rollback is staged as another operation, so it follows the same preview, approval, and worker flow as any forward write.
        </p>
        <p className="muted">{message}</p>
        <div className="row">
          <Link className="button secondary" href="/listings">
            Back to listings
          </Link>
        </div>
      </section>

      <section className="grid two">
        <div className="card stack">
          <h2>Choose source operation</h2>
          <select
            className="input"
            value={sourceOperationId}
            onChange={(event) => setSourceOperationId(event.target.value)}
          >
            <option value="">Select an operation</option>
            {operations.map((operation) => (
              <option key={operation.id} value={operation.id}>
                {operation.type} - {operation.status} - {operation.id}
              </option>
            ))}
          </select>
          <button className="button" onClick={previewRollback}>
            Preview rollback
          </button>
        </div>

        <div className="card">
          <h2>Listings to roll back</h2>
          <div className="stack" style={{ marginTop: 14 }}>
            {listings.map((listing) => (
              <label key={listing.etsyListingId} className="card" style={{ padding: 14 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <strong>{listing.title || listing.etsyListingId}</strong>
                    <div className="muted">#{listing.etsyListingId}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={selectedListings.includes(listing.etsyListingId)}
                    onChange={(event) => {
                      setSelectedListings((current) =>
                        event.target.checked
                          ? [...current, listing.etsyListingId]
                          : current.filter((id) => id !== listing.etsyListingId)
                      )
                    }}
                  />
                </div>
              </label>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}

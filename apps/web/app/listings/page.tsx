'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Shop = {
  id: string
  etsyShopId: string | null
  shopName: string | null
  tokenStatus: {
    accessTokenExpiresAt: string | null
    refreshTokenExpiresAt: string | null
    accessTokenSecondsRemaining: number | null
    refreshTokenDaysRemaining: number | null
    needsAttention: boolean
    attentionLevel: 'ok' | 'warning' | 'critical'
    message: string
  } | null
}

type Listing = {
  etsyListingId: string
  title: string | null
  description: string | null
  state: string | null
  tags: string[]
  updatedAt: string
}

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000'

function formatTags(tags: string[]) {
  return tags.length > 0 ? tags : ['No tags']
}

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime()
  const diffMs = timestamp - Date.now()
  const absSeconds = Math.round(Math.abs(diffMs) / 1000)

  if (absSeconds < 60) {
    return diffMs >= 0 ? 'in a few seconds' : `${absSeconds}s ago`
  }

  const absMinutes = Math.round(absSeconds / 60)
  if (absMinutes < 60) {
    return diffMs >= 0 ? `in ${absMinutes}m` : `${absMinutes}m ago`
  }

  const absHours = Math.round(absMinutes / 60)
  return diffMs >= 0 ? `in ${absHours}h` : `${absHours}h ago`
}

export default function ListingsPage() {
  const [shop, setShop] = useState<Shop | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [status, setStatus] = useState('Ready.')
  const [loading, setLoading] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null)
  const tokenStatus = shop?.tokenStatus

  async function loadData(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setLoading(true)
    }

    try {
      const [shopResponse, listingsResponse] = await Promise.all([
        fetch(`${apiBase}/api/listings/shop`),
        fetch(`${apiBase}/api/listings`)
      ])

      setShop(await shopResponse.json())
      const listingData = await listingsResponse.json()
      setListings(listingData.listings || [])
      setLastRefreshed(new Date().toISOString())
    } finally {
      if (!options?.silent) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    let active = true

    const run = async () => {
      if (!active) return
      await loadData()
    }

    void run()

    const timer = window.setInterval(() => {
      void loadData({ silent: true })
    }, 15000)

    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  async function syncListings() {
    setStatus('Syncing listings...')
    const response = await fetch(`${apiBase}/api/listings/sync`, { method: 'POST' })
    const data = await response.json()

    if (!response.ok) {
      setStatus(data.error || 'Failed to sync listings.')
      return
    }

    setStatus(`Synced ${data.synced} listings.`)
    await loadData()
  }

  return (
    <main className="shell stack">
      <section className="hero">
        <div className="eyebrow">Listings</div>
        <h1>Browse and edit every listing</h1>
        <p className="lede">
          Sync the latest cache, then open any listing to update title, description, or tags in a focused editor.
        </p>
        <div className="row">
          <button className="button" onClick={syncListings}>
            Sync Listings
          </button>
          <Link className="button secondary" href="/rollback">
            Rollback
          </Link>
        </div>
        <p className="muted">{status}</p>
        <p className="muted">
          {lastRefreshed ? `Last refreshed ${formatRelativeTime(lastRefreshed)}.` : 'Live cache updates every 15 seconds.'}
        </p>
        {tokenStatus?.needsAttention ? (
          <div
            className="card"
            style={{
              padding: 16,
              borderColor:
                tokenStatus.attentionLevel === 'critical'
                  ? 'rgba(239, 68, 68, 0.45)'
                  : 'rgba(245, 158, 11, 0.45)',
              background:
                tokenStatus.attentionLevel === 'critical'
                  ? 'linear-gradient(180deg, rgba(127, 29, 29, 0.36), rgba(15, 23, 42, 0.78))'
                  : 'linear-gradient(180deg, rgba(120, 53, 15, 0.28), rgba(15, 23, 42, 0.78))'
            }}
          >
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="stack" style={{ gap: 8 }}>
                <div className={`pill ${tokenStatus.attentionLevel === 'critical' ? 'bad' : 'warn'}`}>
                  Etsy auth {tokenStatus.attentionLevel === 'critical' ? 'needs attention' : 'expires soon'}
                </div>
                <p className="muted">{tokenStatus.message}</p>
                <p className="muted">
                  {tokenStatus.refreshTokenExpiresAt
                    ? `Refresh token expiry: ${new Date(tokenStatus.refreshTokenExpiresAt).toLocaleDateString()}`
                    : 'Refresh token expiry unknown'}
                </p>
              </div>
              <Link className="button secondary" href="/connect">
                Reconnect Etsy
              </Link>
            </div>
          </div>
        ) : null}
        {shop ? (
          <p className="muted">
            Connected shop: <strong>{shop.shopName || shop.etsyShopId || shop.id}</strong>
          </p>
        ) : null}
      </section>

      <section className="card stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2>All listings</h2>
            <p className="muted">
              {loading ? 'Loading…' : `${listings.length} listing${listings.length === 1 ? '' : 's'} available`}
            </p>
          </div>
          <div className="pill">{loading ? 'Refreshing' : 'Live cache'}</div>
        </div>

        <div className="listing-grid">
          {listings.map((listing) => (
            <article key={listing.etsyListingId} className="listing-card stack">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div className="stack" style={{ gap: 8 }}>
                  <div className="pill">#{listing.etsyListingId}</div>
                  <h3>{listing.title || `Listing ${listing.etsyListingId}`}</h3>
                </div>
              </div>

              <div className="tag-row">
                {formatTags(listing.tags).map((tag) => (
                  <span key={tag} className="tag-pill">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="muted">Updated {formatRelativeTime(listing.updatedAt)}</span>
                <Link className="button" href={`/listings/${listing.etsyListingId}`}>
                  UPDATE LISTING
                </Link>
              </div>
            </article>
          ))}
        </div>

        {!loading && listings.length === 0 ? (
          <p className="muted">No listings yet. Sync to pull data into the local cache.</p>
        ) : null}
      </section>
    </main>
  )
}

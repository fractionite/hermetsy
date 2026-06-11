'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

type Listing = {
  etsyListingId: string
  title: string | null
  description: string | null
  tags: string[]
  updatedAt: string
}

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000'

function normalizeTag(tag: string) {
  return tag.trim().replace(/\s+/g, ' ')
}

export default function ListingEditorPage() {
  const params = useParams<{ listingId: string }>()
  const listingId = params?.listingId

  const [listing, setListing] = useState<Listing | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [status, setStatus] = useState('Loading listing...')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!listingId) return

    async function loadListing() {
      try {
        const response = await fetch(`${apiBase}/api/listings/${listingId}`)
        const data = await response.json()

        if (!response.ok) {
          setStatus(data.error || 'Listing not found.')
          return
        }

        setListing(data)
        setTitle(data.title || '')
        setDescription(data.description || '')
        setTags(Array.isArray(data.tags) ? data.tags.map((tag: string) => normalizeTag(tag)).filter(Boolean) : [])
        setTagInput('')
        setStatus('Ready to edit.')
      } finally {
        // If the listing failed to load, the status above explains why.
      }
    }

    void loadListing()
  }, [listingId])

  const tagPreview = useMemo(() => tags.slice(0, 13), [tags])

  function addTag() {
    const nextTag = normalizeTag(tagInput)

    if (!nextTag) return

    setTags((current) => {
      if (current.length >= 13) return current
      if (current.some((tag) => tag.toLowerCase() === nextTag.toLowerCase())) return current
      return [...current, nextTag]
    })
    setTagInput('')
  }

  function removeTag(tagToRemove: string) {
    setTags((current) => current.filter((tag) => tag !== tagToRemove))
  }

  async function loadCurrentListing() {
    if (!listingId) return

    const response = await fetch(`${apiBase}/api/listings/${listingId}`)
    const data = await response.json()

    if (!response.ok) {
      setStatus(data.error || 'Listing not found.')
      return false
    }

    setListing(data)
    setTitle(data.title || '')
    setDescription(data.description || '')
    setTags(Array.isArray(data.tags) ? data.tags.map((tag: string) => normalizeTag(tag)).filter(Boolean) : [])
    setTagInput('')
    return true
  }

  async function saveListing(options?: { syncAfterSave?: boolean }) {
    if (!listingId) return

    setSaving(true)
    setStatus('Saving listing...')

    try {
      const response = await fetch(`${apiBase}/api/listings/${listingId}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          title,
          description,
          tags
        })
      })

      const data = await response.json()

      if (!response.ok) {
        const message = data.validationErrors?.length ? data.validationErrors.join(' ') : data.error
        setStatus(message || 'Unable to save listing.')
        return
      }

      setStatus('Listing saved.')

      if (options?.syncAfterSave) {
        setStatus('Listing saved. Refreshing editor...')
      }

      await loadCurrentListing()
      setStatus(
        options?.syncAfterSave
          ? 'Listing saved and refreshed in the editor.'
          : 'Listing saved.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="shell stack">
      <section className="hero">
        <div className="eyebrow">Listing editor</div>
        <h1>Edit the live listing</h1>
        <p className="lede">
          Update the title, description, and tags here. Saving updates the local cache and, in real mode, pushes the change to Etsy.
        </p>
        <div className="row">
          <Link className="button secondary" href="/listings">
            Back to listings
          </Link>
          <button className="button secondary" onClick={() => void saveListing()} disabled={saving || !listing}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button className="button" onClick={() => void saveListing({ syncAfterSave: true })} disabled={saving || !listing}>
            {saving ? 'Saving & refreshing…' : 'Save & refresh'}
          </button>
        </div>
        <p className="muted">{status}</p>
        {listing ? <p className="muted">Editing listing #{listing.etsyListingId}</p> : null}
      </section>

      <section className="grid two">
        <div className="card stack">
          <h2>Fields</h2>
          <label className="stack">
            <span className="muted">Title</span>
            <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>

          <label className="stack">
            <span className="muted">Description</span>
            <textarea
              className="textarea"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          <label className="stack">
            <span className="muted">Tags</span>
            <div className="tag-editor">
              <div className="tag-row">
                {tagPreview.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className="tag-chip"
                    onClick={() => removeTag(tag)}
                    aria-label={`Remove tag ${tag}`}
                    title="Click to remove"
                  >
                    {tag}
                    <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
              <div className="row">
                <input
                  className="input"
                  value={tagInput}
                  placeholder="Add a tag"
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addTag()
                    }
                  }}
                />
                <button className="button secondary" type="button" onClick={addTag}>
                  Add tag
                </button>
              </div>
            </div>
            <span className="muted">Click a tag to remove it. Up to 13 tags total.</span>
          </label>
        </div>

        <div className="card stack">
          <h2>Preview</h2>
          <div className="stack" style={{ gap: 10 }}>
            <div>
              <div className="muted">ID</div>
              <strong>#{listing?.etsyListingId || listingId}</strong>
            </div>

            <div>
              <div className="muted">Title</div>
              <strong>{title || 'Untitled listing'}</strong>
            </div>

            <div>
              <div className="muted">Description</div>
              <p className="muted" style={{ lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {description || 'No description yet.'}
              </p>
            </div>

            <div>
              <div className="muted">Tags</div>
              <div className="tag-row" style={{ marginTop: 10 }}>
                {tagPreview.length > 0 ? (
                  tagPreview.map((tag) => (
                    <span key={tag} className="tag-pill">
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className="muted">No tags</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

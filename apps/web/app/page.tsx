import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <div className="eyebrow">Local Docker workflow</div>
        <h1>Etsy listing operations without the risk.</h1>
        <p className="lede">
          Sync listings locally, browse every listing as a card, edit title, description, and tags in a focused editor, and test rollback in mock mode before any real Etsy write is enabled.
        </p>
        <div className="row">
          <Link className="button" href="/connect">
            Connect Etsy
          </Link>
          <Link className="button secondary" href="/listings">
            View Listings
          </Link>
        </div>
      </section>

      <section className="grid two" style={{ marginTop: 18 }}>
        <div className="card">
          <h2>What’s running</h2>
          <p className="muted">
            Fastify API, BullMQ worker, PostgreSQL, Redis, and a Next.js UI all in Docker Compose.
          </p>
        </div>
        <div className="card">
          <h2>Safety defaults</h2>
          <p className="muted">
            Mock Etsy mode and write-disable are on by default so the stack is useful even before Etsy approval lands.
          </p>
        </div>
      </section>
    </main>
  )
}

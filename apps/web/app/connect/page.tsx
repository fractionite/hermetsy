export default function ConnectPage() {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000'

  return (
    <main className="shell">
      <section className="hero">
        <div className="eyebrow">OAuth</div>
        <h1>Connect Etsy</h1>
        <p className="lede">
          This launches the OAuth start endpoint on the API. In local mock mode, the callback will create a mock shop and token record so the rest of the flow can be exercised immediately.
        </p>
        <div className="row">
          <a className="button" href={`${apiBase}/api/auth/etsy/start`}>
            Start Etsy OAuth
          </a>
          <a className="button secondary" href="/">
            Back home
          </a>
        </div>
      </section>
    </main>
  )
}

import Link from 'next/link'

export default function ConnectSuccessPage({
  searchParams
}: {
  searchParams?: { mock?: string }
}) {
  const mock = searchParams?.mock === 'true'

  return (
    <main className="shell">
      <section className="hero">
        <div className="eyebrow">Connected</div>
        <h1>{mock ? 'Mock connection ready' : 'Etsy connection complete'}</h1>
        <p className="lede">
          {mock
            ? 'You are in local mock mode, which means sync and operations can be tested without real Etsy writes.'
            : 'Your OAuth callback returned successfully. Next, sync listings and open a listing card to edit it.'}
        </p>
        <div className="row">
          <Link className="button" href="/listings">
            Continue to listings
          </Link>
          <Link className="button secondary" href="/">
            Home
          </Link>
        </div>
      </section>
    </main>
  )
}

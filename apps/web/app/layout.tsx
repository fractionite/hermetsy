import './globals.css'

export const metadata = {
  title: 'Etsy Listing Assistant',
  description: 'Local Dockerized listing sync, transformation, and rollback workflow.'
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

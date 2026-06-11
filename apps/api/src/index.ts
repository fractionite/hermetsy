import 'dotenv/config'

import Fastify from 'fastify'
import cors from '@fastify/cors'
import { agentRoutes } from './routes/agent.routes.js'
import { authRoutes } from './routes/auth.routes.js'
import { listingRoutes } from './routes/listings.routes.js'
import { operationRoutes } from './routes/operations.routes.js'
import { rollbackRoutes } from './routes/rollback.routes.js'

async function main() {
  const app = Fastify({ logger: true })

  await app.register(cors, {
    origin: process.env.WEB_BASE_URL,
    credentials: true
  })

  app.get('/health', async () => ({
    ok: true,
    service: 'etsy-listing-api',
    mockEtsy: process.env.MOCK_ETSY === 'true',
    writeDisabled: process.env.ETSY_WRITE_DISABLED === 'true'
  }))

  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(listingRoutes, { prefix: '/api/listings' })
  await app.register(operationRoutes, { prefix: '/api/operations' })
  await app.register(rollbackRoutes, { prefix: '/api/rollback' })
  await app.register(agentRoutes)

  const port = Number(process.env.API_PORT || 4000)

  await app.listen({ port, host: '0.0.0.0' })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

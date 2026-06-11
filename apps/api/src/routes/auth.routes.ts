import type { FastifyInstance } from 'fastify'
import crypto from 'node:crypto'
import { prisma } from '@etsybot/database'
import {
  exchangeEtsyAuthorizationCode,
  toStoredEtsyOAuthTokens
} from '@etsybot/shared'

const pendingOAuth = new Map<string, { codeVerifier: string }>()

function base64Url(buffer: Buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function createPkcePair() {
  const codeVerifier = base64Url(crypto.randomBytes(64))
  const codeChallenge = base64Url(
    crypto.createHash('sha256').update(codeVerifier).digest()
  )

  return { codeVerifier, codeChallenge }
}

function getRedirectUri() {
  const redirectUri = process.env.ETSY_REDIRECT_URI

  if (!redirectUri) {
    throw new Error(
      'ETSY_REDIRECT_URI is required. Set it to the exact HTTPS callback URL registered in Etsy.'
    )
  }

  return redirectUri
}

function extractShopIdFromGetMe(payload: unknown): bigint | null {
  const visit = (value: unknown): bigint | null => {
    if (!value || typeof value !== 'object') {
      return null
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = visit(item)
        if (found) return found
      }
      return null
    }

    const record = value as Record<string, unknown>
    const direct = record.shop_id ?? record.shopId ?? record.id

    if (typeof direct === 'string' || typeof direct === 'number' || typeof direct === 'bigint') {
      try {
        return BigInt(direct)
      } catch {
        // Ignore invalid numeric strings and keep searching.
      }
    }

    for (const key of Object.keys(record)) {
      const found = visit(record[key])
      if (found) return found
    }

    return null
  }

  return visit(payload)
}

function extractUserIdFromGetMe(payload: unknown): bigint | null {
  const visit = (value: unknown): bigint | null => {
    if (!value || typeof value !== 'object') {
      return null
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = visit(item)
        if (found) return found
      }
      return null
    }

    const record = value as Record<string, unknown>
    const direct = record.user_id ?? record.userId ?? record.id

    if (typeof direct === 'string' || typeof direct === 'number' || typeof direct === 'bigint') {
      try {
        return BigInt(direct)
      } catch {
        // Ignore invalid numeric strings and keep searching.
      }
    }

    for (const key of Object.keys(record)) {
      const found = visit(record[key])
      if (found) return found
    }

    return null
  }

  return visit(payload)
}

export async function authRoutes(app: FastifyInstance) {
  app.get('/etsy/start', async (_request, reply) => {
    const { codeVerifier, codeChallenge } = createPkcePair()
    const state = crypto.randomUUID()

    pendingOAuth.set(state, { codeVerifier })

    const scopes = process.env.ETSY_SCOPES || 'listings_r listings_w shops_r'
    const redirectUri = getRedirectUri()

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.ETSY_API_KEY || '',
      redirect_uri: redirectUri,
      scope: scopes,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    })

    return reply.redirect(`https://www.etsy.com/oauth/connect?${params.toString()}`)
  })

  app.get('/etsy/callback', async (request, reply) => {
    const query = request.query as {
      code?: string
      state?: string
      error?: string
    }

    if (query.error) {
      return reply.redirect(`${process.env.WEB_BASE_URL || 'http://localhost:3000'}/connect?error=${query.error}`)
    }

    if (!query.code || !query.state) {
      return reply.code(400).send({ error: 'Missing code or state' })
    }

    const pending = pendingOAuth.get(query.state)

    if (!pending) {
      return reply.code(400).send({ error: 'Invalid or expired OAuth state' })
    }

    pendingOAuth.delete(query.state)

    const webUrl = process.env.WEB_BASE_URL || 'http://localhost:3000'

    if (process.env.MOCK_ETSY === 'true') {
      const shop = await prisma.shop.upsert({
        where: { etsyShopId: BigInt(100001) },
        update: {
          shopName: 'Demo Shop'
        },
        create: {
          etsyShopId: BigInt(100001),
          etsyUserId: BigInt(200001),
          shopName: 'Demo Shop',
          accessLevel: 'personal'
        }
      })

      await prisma.oAuthToken.upsert({
        where: { shopId: shop.id },
        update: {
          accessTokenEncrypted: 'demo-access-token',
          refreshTokenEncrypted: 'demo-refresh-token',
          scope: process.env.ETSY_SCOPES || 'listings_r listings_w shops_r',
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          refreshExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
        },
        create: {
          shopId: shop.id,
          accessTokenEncrypted: 'demo-access-token',
          refreshTokenEncrypted: 'demo-refresh-token',
          scope: process.env.ETSY_SCOPES || 'listings_r listings_w shops_r',
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          refreshExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
        }
      })

      return reply.redirect(`${webUrl}/connect/success?mock=true`)
    }

    const exchange = await exchangeEtsyAuthorizationCode({
      code: query.code,
      codeVerifier: pending.codeVerifier,
      clientId: process.env.ETSY_API_KEY || '',
      redirectUri: getRedirectUri()
    })
    const etsy = (await import('@etsybot/shared')).createEtsyClient()
    const me = await etsy.getMe(exchange.access_token)
    const discoveredShopId = extractShopIdFromGetMe(me)
    const discoveredUserId = extractUserIdFromGetMe(me)
    const configuredShopId = process.env.ETSY_SHOP_ID
    const etsyShopId = discoveredShopId ?? (configuredShopId ? BigInt(configuredShopId) : null)

    if (!etsyShopId) {
      return reply.code(500).send({
        error:
          'Could not determine ETSY_SHOP_ID from getMe. Set ETSY_SHOP_ID manually as a fallback.'
      })
    }

    const shop = await prisma.shop.upsert({
      where: { etsyShopId },
      update: {
        shopName:
          (me as { shops?: Array<{ shop_name?: string }> })?.shops?.[0]?.shop_name ||
          'Etsy Shop',
        etsyUserId: discoveredUserId
      },
      create: {
        etsyShopId,
        etsyUserId: discoveredUserId,
        shopName:
          (me as { shops?: Array<{ shop_name?: string }> })?.shops?.[0]?.shop_name ||
          'Etsy Shop',
        accessLevel: 'personal'
      }
    })

    const storedTokens = toStoredEtsyOAuthTokens(exchange)

    await prisma.oAuthToken.upsert({
      where: { shopId: shop.id },
      update: {
        ...storedTokens,
        scope: process.env.ETSY_SCOPES || 'listings_r listings_w shops_r'
      },
      create: {
        shopId: shop.id,
        ...storedTokens,
        scope: process.env.ETSY_SCOPES || 'listings_r listings_w shops_r'
      }
    })

    return reply.redirect(`${webUrl}/connect/success?mock=false`)
  })
}

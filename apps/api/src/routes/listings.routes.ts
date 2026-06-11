import type { FastifyInstance } from 'fastify'
import { prisma } from '@etsybot/database'
import {
  createEtsyClient,
  getEtsyTokenStatus,
  getValidEtsyAccessToken,
  validateListingUpdate
} from '@etsybot/shared'
import { normalizeTags, resolveConnectedShop, serializeListing } from '../lib/listings.js'

export async function listingRoutes(app: FastifyInstance) {
  app.post('/sync', async () => {
    const etsy = createEtsyClient()

    let shop = await resolveConnectedShop()

    if (!shop && process.env.MOCK_ETSY === 'true') {
      shop = await prisma.shop.create({
        data: {
          etsyShopId: BigInt(100001),
          etsyUserId: BigInt(200001),
          shopName: 'Demo Shop',
          accessLevel: 'personal',
          tokens: {
            create: {
              accessTokenEncrypted: 'demo-access-token',
              refreshTokenEncrypted: 'demo-refresh-token',
              scope: process.env.ETSY_SCOPES || 'listings_r listings_w shops_r',
              expiresAt: new Date(Date.now() + 60 * 60 * 1000),
              refreshExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
            }
          }
        },
        include: { tokens: true }
      })
    }

    if (!shop) {
      return {
        ok: false,
        error:
          'No connected Etsy shop found. Complete OAuth in real mode so the app can discover and save your live Etsy shop id.'
      }
    }

    const isMock = process.env.MOCK_ETSY === 'true'
    const etsyShopId = shop.etsyShopId?.toString()
    const accessToken = isMock
      ? undefined
      : await getValidEtsyAccessToken({
          token: shop.tokens,
          clientId: process.env.ETSY_API_KEY || '',
          onRefresh: async (tokens) => {
            await prisma.oAuthToken.update({
              where: {
                shopId: shop.id
              },
              data: tokens
            })
          }
        })
    const response = isMock
      ? await etsy.getShopListings()
      : await etsy.getShopListings(etsyShopId, accessToken)

    for (const listing of response.results) {
      await prisma.listingCache.upsert({
        where: {
          shopId_etsyListingId: {
            shopId: shop.id,
            etsyListingId: BigInt(listing.listing_id)
          }
        },
        update: {
          state: listing.state,
          title: listing.title,
          description: listing.description,
          tags: listing.tags,
          lastModifiedTimestamp: BigInt(listing.last_modified_timestamp),
          rawPayload: listing,
          fetchedAt: new Date()
        },
        create: {
          shopId: shop.id,
          etsyListingId: BigInt(listing.listing_id),
          state: listing.state,
          title: listing.title,
          description: listing.description,
          tags: listing.tags,
          lastModifiedTimestamp: BigInt(listing.last_modified_timestamp),
          rawPayload: listing
        }
      })
    }

    await prisma.auditEvent.create({
      data: {
        shopId: shop.id,
        eventType: 'listings_synced',
        message: `Synced ${response.results.length} listings`
      }
    })

    return {
      ok: true,
      shopId: shop.id,
      synced: response.results.length
    }
  })

  app.get('/', async () => {
    const listings = await prisma.listingCache.findMany({
      orderBy: {
        updatedAt: 'desc'
      }
    })

    return {
      listings: listings.map(serializeListing)
    }
  })

  app.get('/shop', async () => {
    const shop = await resolveConnectedShop()

    return shop
      ? {
          ...shop,
          etsyShopId: shop.etsyShopId?.toString() || null,
          etsyUserId: shop.etsyUserId?.toString() || null,
          tokenStatus: getEtsyTokenStatus(shop.tokens)
        }
      : null
  })

  app.get('/:listingId', async (request, reply) => {
    const params = request.params as { listingId: string }

    const listing = await prisma.listingCache.findFirst({
      where: {
        etsyListingId: BigInt(params.listingId)
      }
    })

    if (!listing) {
      return reply.code(404).send({ error: 'Listing not found' })
    }

    return serializeListing(listing)
  })

  app.patch('/:listingId', async (request, reply) => {
    const params = request.params as { listingId: string }
    const body = request.body as {
      title?: string
      description?: string
      tags?: string[] | string
    }

    const listing = await prisma.listingCache.findFirst({
      where: {
        etsyListingId: BigInt(params.listingId)
      },
      include: {
        shop: {
          include: {
            tokens: true
          }
        }
      }
    })

    if (!listing) {
      return reply.code(404).send({ error: 'Listing not found' })
    }

    const nextTitle = body.title?.trim() ?? listing.title ?? ''
    const nextDescription = body.description?.trim() ?? listing.description ?? ''
    const nextTags = normalizeTags(body.tags ?? listing.tags)
    const validation = validateListingUpdate({
      title: nextTitle,
      description: nextDescription,
      tags: nextTags
    })

    if (!validation.valid) {
      return reply.code(400).send({
        error: 'Validation failed',
        validationErrors: validation.errors
      })
    }

    const etsy = createEtsyClient()
    const isMock = process.env.MOCK_ETSY === 'true'
    const shopId = listing.shop.etsyShopId?.toString()
    const accessToken = isMock
      ? undefined
      : await getValidEtsyAccessToken({
          token: listing.shop.tokens,
          clientId: process.env.ETSY_API_KEY || '',
          onRefresh: async (tokens) => {
            await prisma.oAuthToken.update({
              where: {
                shopId: listing.shop.id
              },
              data: tokens
            })
          }
        })

    if (!isMock) {
      await etsy.updateListing(shopId, listing.etsyListingId.toString(), accessToken, {
        title: nextTitle,
        description: nextDescription,
        tags: nextTags
      })
    }

    const updated = await prisma.listingCache.update({
      where: {
        shopId_etsyListingId: {
          shopId: listing.shopId,
          etsyListingId: listing.etsyListingId
        }
      },
      data: {
        title: nextTitle,
        description: nextDescription,
        tags: nextTags,
        rawPayload: {
          ...(typeof listing.rawPayload === 'object' && listing.rawPayload !== null ? listing.rawPayload : {}),
          title: nextTitle,
          description: nextDescription,
          tags: nextTags
        },
        fetchedAt: new Date()
      }
    })

    await prisma.auditEvent.create({
      data: {
        shopId: listing.shopId,
        etsyListingId: listing.etsyListingId,
        eventType: isMock ? 'listing_updated_mock' : 'listing_updated',
        message: 'Listing updated from editor'
      }
    })

    return serializeListing(updated)
  })
}

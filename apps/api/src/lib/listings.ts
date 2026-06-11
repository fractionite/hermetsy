import { prisma } from '@etsybot/database'

export function serializeListing(listing: {
  etsyListingId: bigint
  lastModifiedTimestamp: bigint | null
  tags: unknown
  [key: string]: unknown
}) {
  return {
    ...listing,
    etsyListingId: listing.etsyListingId.toString(),
    lastModifiedTimestamp: listing.lastModifiedTimestamp?.toString() || null,
    tags: Array.isArray(listing.tags) ? listing.tags : []
  }
}

export function normalizeTags(input: unknown) {
  if (Array.isArray(input)) {
    return input
      .map((tag) => String(tag).trim())
      .filter((tag) => tag.length > 0)
      .slice(0, 13)
  }

  if (typeof input === 'string') {
    return input
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
      .slice(0, 13)
  }

  return []
}

export async function resolveConnectedShop() {
  const isMock = process.env.MOCK_ETSY === 'true'
  const liveShopId = process.env.ETSY_SHOP_ID

  if (isMock) {
    return prisma.shop.findFirst({
      orderBy: { updatedAt: 'desc' },
      include: { tokens: true }
    })
  }

  if (!liveShopId) {
    return prisma.shop.findFirst({
      where: {
        tokens: {
          isNot: null
        }
      },
      orderBy: { updatedAt: 'desc' },
      include: { tokens: true }
    })
  }

  return prisma.shop.findUnique({
    where: {
      etsyShopId: BigInt(liveShopId)
    },
    include: { tokens: true }
  })
}


import { prisma } from '../src/client'

async function main() {
  const shop = await prisma.shop.upsert({
    where: {
      etsyShopId: BigInt(100001)
    },
    update: {
      shopName: 'Demo Shop',
      accessLevel: 'personal'
    },
    create: {
      etsyShopId: BigInt(100001),
      etsyUserId: BigInt(200001),
      shopName: 'Demo Shop',
      accessLevel: 'personal'
    }
  })

  await prisma.oAuthToken.upsert({
    where: {
      shopId: shop.id
    },
    update: {
      accessTokenEncrypted: 'demo-access-token',
      refreshTokenEncrypted: 'demo-refresh-token',
      scope: 'listings_r listings_w shops_r',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      refreshExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    },
    create: {
      shopId: shop.id,
      accessTokenEncrypted: 'demo-access-token',
      refreshTokenEncrypted: 'demo-refresh-token',
      scope: 'listings_r listings_w shops_r',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      refreshExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    }
  })

  const listings = [
    {
      etsyListingId: BigInt(1001),
      state: 'active',
      title: 'Sample Ceramic Mug, Handmade Gift',
      description: 'A neutral demo listing used to showcase sync and editing flows.',
      tags: ['ceramic mug', 'handmade gift', 'demo'],
      lastModifiedTimestamp: BigInt(1710000000),
      rawPayload: {
        listing_id: 1001,
        state: 'active',
        title: 'Sample Ceramic Mug, Handmade Gift',
        description: 'A neutral demo listing used to showcase sync and editing flows.',
        tags: ['ceramic mug', 'handmade gift', 'demo'],
        last_modified_timestamp: 1710000000
      }
    },
    {
      etsyListingId: BigInt(1002),
      state: 'active',
      title: 'Sample Linen Tote, Everyday Carry',
      description: 'A second neutral demo listing for list and rollback workflows.',
      tags: ['linen tote', 'everyday carry', 'demo'],
      lastModifiedTimestamp: BigInt(1710000100),
      rawPayload: {
        listing_id: 1002,
        state: 'active',
        title: 'Sample Linen Tote, Everyday Carry',
        description: 'A second neutral demo listing for list and rollback workflows.',
        tags: ['linen tote', 'everyday carry', 'demo'],
        last_modified_timestamp: 1710000100
      }
    }
  ]

  for (const listing of listings) {
    await prisma.listingCache.upsert({
      where: {
        shopId_etsyListingId: {
          shopId: shop.id,
          etsyListingId: listing.etsyListingId
        }
      },
      update: {
        state: listing.state,
        title: listing.title,
        description: listing.description,
        tags: listing.tags,
        lastModifiedTimestamp: listing.lastModifiedTimestamp,
        rawPayload: listing.rawPayload,
        fetchedAt: new Date()
      },
      create: {
        shopId: shop.id,
        etsyListingId: listing.etsyListingId,
        state: listing.state,
        title: listing.title,
        description: listing.description,
        tags: listing.tags,
        lastModifiedTimestamp: listing.lastModifiedTimestamp,
        rawPayload: listing.rawPayload
      }
    })
  }

  await prisma.auditEvent.create({
    data: {
      shopId: shop.id,
      eventType: 'seeded_mock_shop',
      message: 'Seeded demo Etsy shop and listings'
    }
  })

  console.log(`Seeded shop ${shop.id} with ${listings.length} listings`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

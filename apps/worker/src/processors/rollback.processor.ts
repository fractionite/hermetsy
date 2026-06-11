import { prisma } from '@etsybot/database'
import { createEtsyClient, getValidEtsyAccessToken } from '@etsybot/shared'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function processRollbackOperation(operationId: string) {
  const operation = await prisma.bulkOperation.findUnique({
    where: {
      id: operationId
    },
    include: {
      shop: {
        include: {
          tokens: true
        }
      },
      items: {
        where: {
          status: 'pending_approval'
        }
      }
    }
  })

  if (!operation) {
    throw new Error(`Operation not found: ${operationId}`)
  }

  await prisma.bulkOperation.update({
    where: { id: operationId },
    data: {
      status: 'running',
      startedAt: new Date()
    }
  })

  const etsy = createEtsyClient()
  const accessToken = operation.shop.tokens
    ? await getValidEtsyAccessToken({
        token: operation.shop.tokens,
        clientId: process.env.ETSY_API_KEY || '',
        onRefresh: async (tokens) => {
          await prisma.oAuthToken.update({
            where: {
              shopId: operation.shop.id
            },
            data: tokens
          })
        }
      })
    : 'mock-token'

  for (const item of operation.items) {
    try {
      await prisma.operationItem.update({
        where: { id: item.id },
        data: {
          status: 'running',
          attemptCount: {
            increment: 1
          }
        }
      })

      const currentListing = await prisma.listingCache.findUnique({
        where: {
          shopId_etsyListingId: {
            shopId: operation.shopId,
            etsyListingId: item.etsyListingId
          }
        }
      })

      if (!currentListing) {
        throw new Error('Listing cache missing before rollback')
      }

      await prisma.listingSnapshot.create({
        data: {
          shopId: operation.shopId,
          operationId: operation.id,
          etsyListingId: item.etsyListingId,
          snapshotType: 'rollback_before_update',
          title: currentListing.title,
          description: currentListing.description,
          tags: currentListing.tags,
          state: currentListing.state,
          lastModifiedTimestamp: currentListing.lastModifiedTimestamp,
          rawPayload: currentListing.rawPayload
        }
      })

      const payload = {
        title: item.newTitle,
        description: item.newDescription
      }

      const response = await etsy.updateListing(
        operation.shop.etsyShopId?.toString() || 'mock-shop',
        item.etsyListingId.toString(),
        accessToken,
        payload
      )

      await prisma.operationItem.update({
        where: { id: item.id },
        data: {
          status: 'success',
          etsyResponse: response
        }
      })

      await prisma.listingCache.update({
        where: {
          shopId_etsyListingId: {
            shopId: operation.shopId,
            etsyListingId: item.etsyListingId
          }
        },
        data: {
          title: item.newTitle,
          description: item.newDescription,
          fetchedAt: new Date()
        }
      })

      await prisma.auditEvent.create({
        data: {
          shopId: operation.shopId,
          operationId: operation.id,
          etsyListingId: item.etsyListingId,
          eventType: 'listing_rolled_back',
          message: 'Rollback completed'
        }
      })

      const delayMs = 1000 / Number(process.env.ETSY_WRITE_REQUESTS_PER_SECOND || 1)
      await sleep(delayMs)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'

      await prisma.operationItem.update({
        where: { id: item.id },
        data: {
          status: 'failed',
          errorMessage: message
        }
      })

      await prisma.auditEvent.create({
        data: {
          shopId: operation.shopId,
          operationId: operation.id,
          etsyListingId: item.etsyListingId,
          eventType: 'rollback_failed',
          message
        }
      })
    }
  }

  const remainingFailures = await prisma.operationItem.count({
    where: {
      operationId,
      status: 'failed'
    }
  })

  await prisma.bulkOperation.update({
    where: {
      id: operationId
    },
    data: {
      status: remainingFailures > 0 ? 'completed_with_errors' : 'completed',
      completedAt: new Date()
    }
  })
}

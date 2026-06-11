import type { FastifyInstance } from 'fastify'
import { prisma } from '@etsybot/database'
import { validateListingUpdate } from '@etsybot/shared'
import { updateQueue } from '../queues/update.queue.js'

export async function rollbackRoutes(app: FastifyInstance) {
  app.post('/preview', async (request) => {
    const body = request.body as {
      shopId: string
      sourceOperationId: string
      listingIds: string[]
    }

    const sourceItems = await prisma.listingSnapshot.findMany({
      where: {
        shopId: body.shopId,
        operationId: body.sourceOperationId,
        etsyListingId: {
          in: body.listingIds.map((id) => BigInt(id))
        },
        snapshotType: 'before_update'
      }
    })

    const operation = await prisma.bulkOperation.create({
      data: {
        shopId: body.shopId,
        type: 'rollback',
        status: 'previewed',
        settings: {
          sourceOperationId: body.sourceOperationId
        }
      }
    })

    for (const snapshot of sourceItems) {
      const validation = validateListingUpdate({
        title: snapshot.title,
        description: snapshot.description
      })

      await prisma.operationItem.create({
        data: {
          operationId: operation.id,
          etsyListingId: snapshot.etsyListingId,
          status: validation.valid ? 'pending_approval' : 'invalid',
          oldTitle: null,
          newTitle: snapshot.title,
          oldDescription: null,
          newDescription: snapshot.description,
          validationErrors: validation.errors
        }
      })
    }

    await prisma.bulkOperation.update({
      where: { id: operation.id },
      data: { totalItems: sourceItems.length }
    })

    return {
      operationId: operation.id,
      totalItems: sourceItems.length
    }
  })

  app.post('/:operationId/approve', async (request) => {
    const params = request.params as { operationId: string }

    const operation = await prisma.bulkOperation.update({
      where: { id: params.operationId },
      data: {
        status: 'approved',
        approvedAt: new Date()
      },
      include: {
        items: {
          where: {
            status: 'pending_approval'
          }
        }
      }
    })

    await updateQueue.add('apply-operation', {
      operationId: operation.id
    })

    return {
      ok: true,
      operationId: operation.id,
      queuedItems: operation.items.length
    }
  })
}

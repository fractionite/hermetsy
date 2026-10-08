import type { FastifyInstance } from 'fastify'
import { prisma } from '@etsybot/database'
import { applyFindReplace, validateListingUpdate, proposalApprovalError } from '@etsybot/shared'
import { updateQueue } from '../queues/update.queue.js'

type FindReplaceRule = {
  find: string
  replace: string
  caseSensitive?: boolean
  regex?: boolean
  fields: Array<'title' | 'description'>
}

export async function operationRoutes(app: FastifyInstance) {
  app.get('/', async () => {
    const operations = await prisma.bulkOperation.findMany({
      orderBy: {
        updatedAt: 'desc'
      },
      take: 25
    })

    return {
      operations: operations.map((operation) => ({
        ...operation
      }))
    }
  })

  app.post('/preview/find-replace', async (request) => {
    const body = request.body as {
      shopId: string
      listingIds: string[]
      rule: FindReplaceRule
    }

    const operation = await prisma.bulkOperation.create({
      data: {
        shopId: body.shopId,
        type: 'find_replace',
        status: 'previewed',
        settings: body.rule
      }
    })

    const listings = await prisma.listingCache.findMany({
      where: {
        shopId: body.shopId,
        etsyListingId: {
          in: body.listingIds.map((id) => BigInt(id))
        }
      }
    })

    for (const listing of listings) {
      let newTitle = listing.title
      let newDescription = listing.description

      if (body.rule.fields.includes('title') && listing.title) {
        newTitle = applyFindReplace(listing.title, body.rule)
      }

      if (body.rule.fields.includes('description') && listing.description) {
        newDescription = applyFindReplace(listing.description, body.rule)
      }

      const validation = validateListingUpdate({
        title: newTitle,
        description: newDescription
      })

      await prisma.operationItem.create({
        data: {
          operationId: operation.id,
          etsyListingId: listing.etsyListingId,
          status: validation.valid ? 'pending_approval' : 'invalid',
          oldTitle: listing.title,
          newTitle,
          oldDescription: listing.description,
          newDescription,
          validationErrors: validation.errors
        }
      })
    }

    const totalItems = await prisma.operationItem.count({
      where: {
        operationId: operation.id
      }
    })

    await prisma.bulkOperation.update({
      where: {
        id: operation.id
      },
      data: {
        totalItems
      }
    })

    return {
      operationId: operation.id,
      totalItems
    }
  })

  app.get('/:operationId', async (request) => {
    const params = request.params as { operationId: string }

    const operation = await prisma.bulkOperation.findUnique({
      where: {
        id: params.operationId
      },
      include: {
        items: true
      }
    })

    if (!operation) {
      return null
    }

    return {
      ...operation,
      items: operation.items.map((item) => ({
        ...item,
        etsyListingId: item.etsyListingId.toString()
      }))
    }
  })

  app.post('/:operationId/approve', async (request, reply) => {
    const params = request.params as { operationId: string }

    const existing = await prisma.bulkOperation.findUnique({ where: { id: params.operationId } })
    if (!existing) return reply.code(404).send({ error: 'Operation not found' })
    if (!['draft', 'previewed'].includes(existing.status)) {
      return reply.code(409).send({ error: `Operation is already ${existing.status}` })
    }
    if (existing.type === 'agent_listing_edit') {
      const body = request.body as { evaluationAcknowledged?: unknown } | undefined
      const error = proposalApprovalError(existing.settings, body?.evaluationAcknowledged === true)
      if (error) return reply.code(409).send({ error })
    }

    const operation = await prisma.bulkOperation.update({
      where: {
        id: params.operationId
      },
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

    if (existing.type === 'agent_listing_edit') {
      await prisma.auditEvent.create({ data: {
        shopId: existing.shopId, operationId: existing.id,
        eventType: 'listing_edit_approved',
        message: 'Proposal approved after evaluation acknowledgement',
        metadata: { evaluationAcknowledged: true }
      } })
    }

    return {
      ok: true,
      operationId: operation.id,
      queuedItems: operation.items.length
    }
  })
}

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@etsybot/database'
import {
  createEtsyClient,
  evaluateListing,
  proposalApprovalError,
  getEtsyTokenStatus,
  validateListingUpdate
} from '@etsybot/shared'
import { updateQueue } from '../queues/update.queue.js'
import { authorizeAgent, getAgentAuthState } from '../lib/agent-auth.js'
import {
  normalizeTags,
  resolveConnectedShop,
  serializeListing
} from '../lib/listings.js'

const proposalBodySchema = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  description: z.string().trim().min(1).optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional()
})

type ListingEditDiff = Array<{
  field: 'title' | 'description' | 'tags'
  before: string | string[] | null
  after: string | string[]
}>

function buildDiff(input: {
  currentTitle: string | null
  nextTitle: string
  currentDescription: string | null
  nextDescription: string
  currentTags: string[]
  nextTags: string[]
}) {
  const diff: ListingEditDiff = []

  if ((input.currentTitle || '') !== input.nextTitle) {
    diff.push({
      field: 'title',
      before: input.currentTitle,
      after: input.nextTitle
    })
  }

  if ((input.currentDescription || '') !== input.nextDescription) {
    diff.push({
      field: 'description',
      before: input.currentDescription,
      after: input.nextDescription
    })
  }

  const currentTags = JSON.stringify(input.currentTags)
  const nextTags = JSON.stringify(input.nextTags)

  if (currentTags !== nextTags) {
    diff.push({
      field: 'tags',
      before: input.currentTags,
      after: input.nextTags
    })
  }

  return diff
}

function serializeListingEdit(operation: {
  id: string
  shopId: string
  type: string
  status: string
  settings: unknown
  approvedAt: Date | null
  startedAt: Date | null
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
  items: Array<{
    id: string
    etsyListingId: bigint
    status: string
    oldTitle: string | null
    newTitle: string | null
    oldDescription: string | null
    newDescription: string | null
    validationErrors: unknown
    etsyResponse: unknown
    errorMessage: string | null
    attemptCount: number
  }>
}) {
  const settings = (operation.settings as Record<string, unknown>) || {}
  const proposed = (settings.proposed as Record<string, unknown> | undefined) || {}
  const diff = (settings.diff as ListingEditDiff | undefined) || []
  const item = operation.items[0]

  return {
    id: operation.id,
    shopId: operation.shopId,
    type: operation.type,
    status: operation.status,
    approvedAt: operation.approvedAt?.toISOString() || null,
    startedAt: operation.startedAt?.toISOString() || null,
    completedAt: operation.completedAt?.toISOString() || null,
    createdAt: operation.createdAt.toISOString(),
    updatedAt: operation.updatedAt.toISOString(),
    sourceListingId: item?.etsyListingId?.toString() || null,
    proposal: {
      title: typeof proposed.title === 'string' ? proposed.title : item?.newTitle || null,
      description:
        typeof proposed.description === 'string' ? proposed.description : item?.newDescription || null,
      tags: Array.isArray(proposed.tags) ? proposed.tags : []
    },
    diff,
    evaluation: settings.evaluation || null,
    item: item
      ? {
          id: item.id,
          etsyListingId: item.etsyListingId.toString(),
          status: item.status,
          oldTitle: item.oldTitle,
          newTitle: item.newTitle,
          oldDescription: item.oldDescription,
          newDescription: item.newDescription,
          validationErrors: item.validationErrors,
          etsyResponse: item.etsyResponse,
          errorMessage: item.errorMessage,
          attemptCount: item.attemptCount
        }
      : null
  }
}

export async function agentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (request, reply) => {
    if (request.url.startsWith('/v1')) {
      const scope = request.url.includes('/approve') ? 'write' : 'read'
      const auth = authorizeAgent(request, reply, scope)

      if (!auth) {
        return reply
      }
    }
  })

  app.get('/v1/health', async () => ({
    ok: true,
    service: 'etsybot-agent-api',
    auth: getAgentAuthState()
  }))

  app.get('/v1/listings', async () => {
    const shop = await resolveConnectedShop()

    if (!shop) {
      return {
        ok: false,
        error: 'No connected Etsy shop found'
      }
    }

    const listings = await prisma.listingCache.findMany({
      where: {
        shopId: shop.id
      },
      orderBy: {
        updatedAt: 'desc'
      }
    })

    return {
      ok: true,
      shop: {
        id: shop.id,
        etsyShopId: shop.etsyShopId?.toString() || null,
        shopName: shop.shopName || null
      },
      listings: listings.map(serializeListing)
    }
  })

  app.get('/v1/token-status', async (request, reply) => {
    const shop = await resolveConnectedShop()

    if (!shop) {
      return reply.code(404).send({ error: 'No connected Etsy shop found' })
    }

    return {
      ok: true,
      shop: {
        id: shop.id,
        etsyShopId: shop.etsyShopId?.toString() || null,
        shopName: shop.shopName || null
      },
      tokenStatus: getEtsyTokenStatus(shop.tokens)
    }
  })

  app.get('/v1/listings/:id', async (request, reply) => {
    const params = request.params as { id: string }
    const shop = await resolveConnectedShop()

    if (!shop) {
      return reply.code(404).send({ error: 'No connected Etsy shop found' })
    }

    const listing = await prisma.listingCache.findFirst({
      where: {
        shopId: shop.id,
        etsyListingId: BigInt(params.id)
      }
    })

    if (!listing) {
      return reply.code(404).send({ error: 'Listing not found' })
    }

    return {
      ok: true,
      listing: serializeListing(listing)
    }
  })

  app.post('/v1/listings/:id/proposals', async (request, reply) => {
    const params = request.params as { id: string }
    const parsed = proposalBodySchema.safeParse(request.body)

    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Invalid proposal payload',
        issues: parsed.error.flatten()
      })
    }

    const shop = await resolveConnectedShop()

    if (!shop) {
      return reply.code(404).send({ error: 'No connected Etsy shop found' })
    }

    const listing = await prisma.listingCache.findFirst({
      where: {
        shopId: shop.id,
        etsyListingId: BigInt(params.id)
      }
    })

    if (!listing) {
      return reply.code(404).send({ error: 'Listing not found' })
    }

    const currentTitle = listing.title || ''
    const currentDescription = listing.description || ''
    const currentTags = normalizeTags(listing.tags)
    const nextTitle = parsed.data.title ?? currentTitle
    const nextDescription = parsed.data.description ?? currentDescription
    const nextTags =
      parsed.data.tags === undefined ? currentTags : normalizeTags(parsed.data.tags)

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

    const diff = buildDiff({
      currentTitle,
      nextTitle,
      currentDescription,
      nextDescription,
      currentTags,
      nextTags
    })

    const evaluation = await evaluateListing({
      source: { title: currentTitle, description: currentDescription, tags: currentTags },
      candidate: { title: nextTitle, description: nextDescription, tags: nextTags }
    }, {
      provider: process.env.LISTING_EVAL_PROVIDER,
      apiKey: process.env.TYPESAFE_API_KEY,
      model: process.env.JEV_MODEL
    })

    const operation = await prisma.$transaction(async (tx) => {
      const created = await tx.bulkOperation.create({
        data: {
          shopId: shop.id,
          type: 'agent_listing_edit',
          status: 'previewed',
          totalItems: 1,
          settings: {
            origin: 'demo',
            listingId: listing.etsyListingId.toString(),
            source: { title: currentTitle, description: currentDescription, tags: currentTags },
            proposed: {
              title: nextTitle,
              description: nextDescription,
              tags: nextTags
            },
            diff,
            evaluation
          }
        }
      })

      await tx.operationItem.create({
        data: {
          operationId: created.id,
          etsyListingId: listing.etsyListingId,
          status: evaluation.decision === 'blocked' ? 'invalid' : 'pending_approval',
          oldTitle: listing.title,
          newTitle: nextTitle,
          oldDescription: listing.description,
          newDescription: nextDescription,
          validationErrors: evaluation.checks.errors
        }
      })

      await tx.auditEvent.create({
        data: {
          shopId: shop.id,
          operationId: created.id,
          etsyListingId: listing.etsyListingId,
          eventType: 'agent_listing_edit_proposed',
          message: 'Agent proposal created',
          metadata: {
            origin: 'demo',
            diff,
            evaluation
          }
        }
      })

      return tx.bulkOperation.findUniqueOrThrow({
        where: {
          id: created.id
        },
        include: {
          items: true
        }
      })
    })

    return {
      ok: true,
      edit: serializeListingEdit(operation)
    }
  })

  app.get('/v1/listing-edits/:id', async (request, reply) => {
    const params = request.params as { id: string }
    const shop = await resolveConnectedShop()

    if (!shop) {
      return reply.code(404).send({ error: 'No connected Etsy shop found' })
    }

    const operation = await prisma.bulkOperation.findFirst({
      where: {
        id: params.id,
        shopId: shop.id,
        type: 'agent_listing_edit'
      },
      include: {
        items: true
      }
    })

    if (!operation) {
      return reply.code(404).send({ error: 'Listing edit not found' })
    }

    return {
      ok: true,
      edit: serializeListingEdit(operation)
    }
  })

  app.post('/v1/listing-edits/:id/approve', async (request, reply) => {
    const params = request.params as { id: string }
    const shop = await resolveConnectedShop()

    if (!shop) {
      return reply.code(404).send({ error: 'No connected Etsy shop found' })
    }

    const operation = await prisma.bulkOperation.findFirst({
      where: {
        id: params.id,
        shopId: shop.id,
        type: 'agent_listing_edit'
      },
      include: {
        items: true
      }
    })

    if (!operation) {
      return reply.code(404).send({ error: 'Listing edit not found' })
    }

    if (!['draft', 'previewed'].includes(operation.status)) {
      return reply.code(409).send({
        error: `Listing edit is already ${operation.status}`
      })
    }

    const approvalBody = request.body as { evaluationAcknowledged?: unknown } | undefined
    const evaluationError = proposalApprovalError(operation.settings, approvalBody?.evaluationAcknowledged === true)
    if (evaluationError) return reply.code(409).send({ error: evaluationError })

    const updated = await prisma.bulkOperation.update({
      where: {
        id: operation.id
      },
      data: {
        status: 'approved',
        approvedAt: new Date()
      },
      include: {
        items: true
      }
    })

    await prisma.auditEvent.create({
      data: {
        shopId: shop.id,
        operationId: updated.id,
        etsyListingId: updated.items[0]?.etsyListingId,
        eventType: 'agent_listing_edit_approved',
        message: 'Agent proposal approved after evaluation acknowledgement',
        metadata: { evaluationAcknowledged: true }
      }
    })

    await updateQueue.add('apply-operation', {
      operationId: updated.id
    })

    return {
      ok: true,
      edit: serializeListingEdit(updated),
      queued: true
    }
  })
}

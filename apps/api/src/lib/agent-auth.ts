import type { FastifyReply, FastifyRequest } from 'fastify'

export type AgentScope = 'read' | 'write'

function getTokenConfig() {
  const readToken = process.env.ETSYBOT_AGENT_READ_TOKEN || process.env.ETSYBOT_AGENT_API_TOKEN || ''
  const writeToken = process.env.ETSYBOT_AGENT_WRITE_TOKEN || ''

  return {
    readToken,
    writeToken
  }
}

function getBearerToken(request: FastifyRequest) {
  const header = request.headers.authorization

  if (!header) {
    return null
  }

  const [scheme, value] = header.split(' ')

  if (scheme?.toLowerCase() !== 'bearer' || !value) {
    return null
  }

  return value.trim()
}

export function getAgentAuthState() {
  const { readToken, writeToken } = getTokenConfig()

  return {
    readConfigured: Boolean(readToken),
    writeConfigured: Boolean(writeToken)
  }
}

export function authorizeAgent(
  request: FastifyRequest,
  reply: FastifyReply,
  requiredScope: AgentScope
) {
  const token = getBearerToken(request)
  const { readToken, writeToken } = getTokenConfig()

  if (!token) {
    reply.code(401).send({ error: 'Missing bearer token' })
    return null
  }

  if (requiredScope === 'write') {
    if (!writeToken) {
      reply.code(403).send({
        error: 'Write scope is not configured on the API'
      })
      return null
    }

    if (token !== writeToken) {
      reply.code(403).send({ error: 'Invalid write token' })
      return null
    }

    return 'write' as const
  }

  if (token === writeToken && writeToken) {
    return 'write' as const
  }

  if (token === readToken && readToken) {
    return 'read' as const
  }

  reply.code(403).send({ error: 'Invalid API token' })
  return null
}


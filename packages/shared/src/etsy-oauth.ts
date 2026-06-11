export type EtsyOAuthTokenGrant = {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token: string
}

export type StoredEtsyOAuthTokens = {
  accessTokenEncrypted: string
  refreshTokenEncrypted: string
  expiresAt: Date | null
  refreshExpiresAt: Date | null
}

export type EtsyOAuthTokenState = StoredEtsyOAuthTokens | null | undefined

const OAUTH_TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token'
const ACCESS_TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000
const REFRESH_TOKEN_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000
const REFRESH_WARNING_WINDOW_MS = 14 * 24 * 60 * 60 * 1000

async function requestOAuthToken(form: URLSearchParams): Promise<EtsyOAuthTokenGrant> {
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: form
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Etsy OAuth token request failed (${response.status}): ${errorBody}`)
  }

  return response.json() as Promise<EtsyOAuthTokenGrant>
}

export async function exchangeEtsyAuthorizationCode(input: {
  code: string
  codeVerifier: string
  clientId: string
  redirectUri: string
}) {
  return requestOAuthToken(
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: input.clientId,
      redirect_uri: input.redirectUri,
      code: input.code,
      code_verifier: input.codeVerifier
    })
  )
}

export async function refreshEtsyAccessToken(input: {
  refreshToken: string
  clientId: string
}) {
  return requestOAuthToken(
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: input.clientId,
      refresh_token: input.refreshToken
    })
  )
}

export function toStoredEtsyOAuthTokens(
  grant: Pick<EtsyOAuthTokenGrant, 'access_token' | 'expires_in' | 'refresh_token'>,
  fallbackRefreshToken?: string
): StoredEtsyOAuthTokens {
  const now = Date.now()

  return {
    accessTokenEncrypted: grant.access_token,
    refreshTokenEncrypted: grant.refresh_token || fallbackRefreshToken || '',
    expiresAt: new Date(now + grant.expires_in * 1000),
    refreshExpiresAt: new Date(now + REFRESH_TOKEN_LIFETIME_MS)
  }
}

export function shouldRefreshEtsyAccessToken(
  token: EtsyOAuthTokenState,
  nowMs = Date.now()
) {
  if (!token?.accessTokenEncrypted) {
    return false
  }

  if (!token.expiresAt) {
    return true
  }

  return token.expiresAt.getTime() <= nowMs + ACCESS_TOKEN_REFRESH_SKEW_MS
}

export function getEtsyTokenStatus(
  token: EtsyOAuthTokenState,
  nowMs = Date.now()
) {
  if (!token) {
    return {
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      accessTokenSecondsRemaining: null,
      refreshTokenDaysRemaining: null,
      needsAttention: true,
      attentionLevel: 'critical' as const,
      message: 'No Etsy token is connected yet.'
    }
  }

  const accessTokenExpiresAt = token.expiresAt ? token.expiresAt.toISOString() : null
  const refreshTokenExpiresAt = token.refreshExpiresAt ? token.refreshExpiresAt.toISOString() : null
  const accessTokenSecondsRemaining = token.expiresAt
    ? Math.max(0, Math.floor((token.expiresAt.getTime() - nowMs) / 1000))
    : null
  const refreshTokenDaysRemaining = token.refreshExpiresAt
    ? Math.max(0, Math.ceil((token.refreshExpiresAt.getTime() - nowMs) / (24 * 60 * 60 * 1000)))
    : null

  if (!token.refreshExpiresAt) {
    return {
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      accessTokenSecondsRemaining,
      refreshTokenDaysRemaining,
      needsAttention: true,
      attentionLevel: 'critical' as const,
      message: 'Refresh token expiry is unknown. Reconnect Etsy to restore a known auth state.'
    }
  }

  if (token.refreshExpiresAt.getTime() <= nowMs) {
    return {
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      accessTokenSecondsRemaining,
      refreshTokenDaysRemaining,
      needsAttention: true,
      attentionLevel: 'critical' as const,
      message: 'The Etsy refresh token has expired. Reconnect Etsy to continue writing safely.'
    }
  }

  if (token.refreshExpiresAt.getTime() <= nowMs + REFRESH_WARNING_WINDOW_MS) {
    return {
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      accessTokenSecondsRemaining,
      refreshTokenDaysRemaining,
      needsAttention: true,
      attentionLevel: 'warning' as const,
      message: `The Etsy refresh token expires in about ${refreshTokenDaysRemaining} day${refreshTokenDaysRemaining === 1 ? '' : 's'}.`
    }
  }

  return {
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
    accessTokenSecondsRemaining,
    refreshTokenDaysRemaining,
    needsAttention: false,
    attentionLevel: 'ok' as const,
    message: 'Etsy auth is healthy.'
  }
}

export async function getValidEtsyAccessToken(input: {
  token: EtsyOAuthTokenState
  clientId: string
  onRefresh: (tokens: StoredEtsyOAuthTokens) => Promise<void>
}) {
  const token = input.token

  if (!token?.accessTokenEncrypted) {
    throw new Error('No Etsy access token is configured for this shop')
  }

  if (!shouldRefreshEtsyAccessToken(token)) {
    return token.accessTokenEncrypted
  }

  if (!token.refreshTokenEncrypted) {
    throw new Error('No Etsy refresh token is configured for this shop')
  }

  if (token.refreshExpiresAt && token.refreshExpiresAt.getTime() <= Date.now()) {
    throw new Error('Etsy refresh token has expired; reconnect Etsy to continue')
  }

  if (!input.clientId) {
    throw new Error('ETSY_API_KEY is required for real Etsy requests')
  }

  const refreshed = await refreshEtsyAccessToken({
    refreshToken: token.refreshTokenEncrypted,
    clientId: input.clientId
  })

  const stored = toStoredEtsyOAuthTokens(refreshed, token.refreshTokenEncrypted)
  await input.onRefresh(stored)
  return stored.accessTokenEncrypted
}

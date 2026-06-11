import type { FindReplaceRule } from './types.js'

export type EtsyListing = {
  listing_id: number | string
  state: string
  title: string
  description: string
  tags: string[]
  last_modified_timestamp: number
}

export type EtsyListingsResponse = {
  count: number
  results: EtsyListing[]
}

const SHOP_LISTING_PAGE_SIZE = 100

export interface EtsyClient {
  getShopListings(shopId?: string, accessToken?: string): Promise<EtsyListingsResponse>
  getMe(accessToken?: string): Promise<unknown>
  getListing(
    listingId?: bigint | number,
    shopId?: string,
    accessToken?: string
  ): Promise<unknown>
  updateListing(
    shopId?: string,
    listingId?: string,
    accessToken?: string,
    payload?: unknown
  ): Promise<unknown>
}

const mockListings: EtsyListing[] = [
  {
    listing_id: 1001,
    state: 'active',
    title: 'Sample Ceramic Mug, Handmade Gift',
    description: 'A neutral demo listing used to showcase sync and editing flows.',
    tags: ['ceramic mug', 'handmade gift', 'demo'],
    last_modified_timestamp: 1710000000
  },
  {
    listing_id: 1002,
    state: 'active',
    title: 'Sample Linen Tote, Everyday Carry',
    description: 'A second neutral demo listing for list and rollback workflows.',
    tags: ['linen tote', 'everyday carry', 'demo'],
    last_modified_timestamp: 1710000100
  }
]

export class MockEtsyClient implements EtsyClient {
  async getShopListings(_shopId?: string, _accessToken?: string) {
    return {
      count: mockListings.length,
      results: mockListings
    }
  }

  async getMe() {
    return {
      user_id: 999999,
      shops: [
        {
          shop_id: 123456,
          shop_name: 'Demo Shop'
        }
      ]
    }
  }

  async getListing(listingId?: bigint | number, _shopId?: string, _accessToken?: string) {
    if (listingId === undefined) {
      return undefined
    }

    return mockListings.find((item) => BigInt(item.listing_id) === BigInt(listingId))
  }

  async updateListing(
    _shopId?: string,
    listingId?: string,
    _accessToken?: string,
    payload?: unknown
  ) {
    if (!listingId) {
      throw new Error('Mock Etsy client requires a listingId')
    }

    if (process.env.ETSY_WRITE_DISABLED === 'true') {
      return {
        mock: true,
        writeDisabled: true,
        listing_id: listingId,
        attemptedPayload: payload
      }
    }

    return {
      mock: true,
      listing_id: listingId,
      payload
    }
  }
}

export class RealEtsyClient {
  private apiBase = 'https://openapi.etsy.com/v3/application'

  private get apiKeyHeader() {
    const key = process.env.ETSY_API_KEY || ''
    const secret = process.env.ETSY_SHARED_SECRET || ''
    if (!key || !secret) {
      throw new Error('ETSY_API_KEY and ETSY_SHARED_SECRET are required for real Etsy requests')
    }
    return `${key}:${secret}`
  }

  async request(path: string, options: RequestInit = {}) {
    const response = await fetch(`${this.apiBase}${path}`, {
      ...options,
      headers: {
        'x-api-key': this.apiKeyHeader,
        'content-type': 'application/json',
        ...(options.headers || {})
      }
    })

    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after')
      throw new Error(`Etsy rate limited. Retry after: ${retryAfter}`)
    }

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Etsy API error ${response.status}: ${body}`)
    }

    return response.json()
  }

  async requestAny(paths: string[], accessToken: string) {
    let lastError: unknown

    for (const path of paths) {
      try {
        return await this.request(path, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        })
      } catch (error) {
        lastError = error
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Etsy getMe request failed')
  }

  async getMe(accessToken?: string) {
    if (!accessToken) {
      throw new Error('Real Etsy client requires an accessToken')
    }

    return this.requestAny(['/users/me', '/users/__SELF__'], accessToken)
  }

  async getShopListings(shopId?: string, accessToken?: string): Promise<EtsyListingsResponse> {
    if (!shopId || !accessToken) {
      throw new Error('Real Etsy client requires shopId and accessToken')
    }

    const results: EtsyListing[] = []
    let offset = 0
    let totalCount = 0

    for (;;) {
      const page = (await this.request(
        `/shops/${shopId}/listings?limit=${SHOP_LISTING_PAGE_SIZE}&offset=${offset}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      )) as EtsyListingsResponse

      if (typeof page.count === 'number' && Number.isFinite(page.count)) {
        totalCount = page.count
      }

      const pageResults = Array.isArray(page.results) ? page.results : []
      results.push(...pageResults)

      if (pageResults.length < SHOP_LISTING_PAGE_SIZE) {
        break
      }

      if (typeof page.count === 'number' && results.length >= page.count) {
        break
      }

      if (pageResults.length === 0) {
        break
      }

      offset += SHOP_LISTING_PAGE_SIZE
    }

    return {
      count: totalCount || results.length,
      results
    }
  }

  async getListing(listingId?: bigint | number, shopId?: string, accessToken?: string) {
    if (listingId === undefined || !shopId || !accessToken) {
      throw new Error('Real Etsy client requires shopId, listingId, and accessToken')
    }

    return this.request(`/shops/${shopId}/listings/${listingId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })
  }

  async updateListing(
    shopId?: string,
    listingId?: string,
    accessToken?: string,
    payload?: unknown
  ) {
    if (!shopId || !listingId || !accessToken) {
      throw new Error('Real Etsy client requires shopId, listingId, and accessToken')
    }

    if (process.env.ETSY_WRITE_DISABLED === 'true') {
      return {
        writeDisabled: true,
        listingId,
        attemptedPayload: payload
      }
    }

    return this.request(`/shops/${shopId}/listings/${listingId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    })
  }
}

export function createEtsyClient() {
  return (process.env.MOCK_ETSY === 'true' ? new MockEtsyClient() : new RealEtsyClient()) as EtsyClient
}

export type { FindReplaceRule }

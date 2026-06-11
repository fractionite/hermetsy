export type ListingRecord = {
  id: string
  etsyListingId: bigint
  state: string | null
  title: string | null
  description: string | null
  tags: unknown
  lastModifiedTimestamp: bigint | null
  rawPayload: unknown
  fetchedAt: Date
  createdAt: Date
  updatedAt: Date
}

export type FindReplaceRule = {
  find: string
  replace: string
  caseSensitive?: boolean
  regex?: boolean
  fields: Array<'title' | 'description'>
}

export type OperationPreviewItem = {
  etsyListingId: string
  oldTitle: string | null
  newTitle: string | null
  oldDescription: string | null
  newDescription: string | null
  validationErrors: string[]
  status: 'pending_approval' | 'invalid'
}

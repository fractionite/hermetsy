export function validateListingUpdate(input: {
  title?: string | null
  description?: string | null
  tags?: string[] | null
}) {
  const errors: string[] = []

  if (input.title !== undefined) {
    const title = input.title?.trim() || ''
    if (!title) errors.push('Title cannot be empty.')
    if (title.length > 140) errors.push(`Title is ${title.length} characters. Max is 140.`)
  }

  if (input.description !== undefined) {
    const description = input.description?.trim() || ''
    if (!description) errors.push('Description cannot be empty.')
    if (description.includes('{{') || description.includes('}}')) {
      errors.push('Description contains unresolved template placeholders.')
    }
  }

  if (input.tags !== undefined) {
    const tags = input.tags ?? []

    if (!Array.isArray(tags)) {
      errors.push('Tags must be an array of strings.')
    } else {
      if (tags.length > 13) {
        errors.push(`Tags contains ${tags.length} entries. Max is 13.`)
      }

      for (const tag of tags) {
        const normalized = String(tag).trim()

        if (!normalized) {
          errors.push('Tags cannot contain blank entries.')
          break
        }

        if (normalized.length > 20) {
          errors.push(`Tag "${normalized}" is ${normalized.length} characters. Max is 20.`)
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

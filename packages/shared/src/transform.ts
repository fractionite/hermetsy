import type { FindReplaceRule } from './types.js'

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function applyFindReplace(input: string, rule: FindReplaceRule) {
  const flags = rule.caseSensitive ? 'g' : 'gi'
  const pattern = rule.regex
    ? new RegExp(rule.find, flags)
    : new RegExp(escapeRegExp(rule.find), flags)
  return input.replace(pattern, rule.replace)
}

export function upsertManagedBlock(
  description: string,
  blockName: string,
  content: string
) {
  const start = `<!-- APP:${blockName}:v1 -->`
  const end = `<!-- /APP:${blockName} -->`
  const block = `${start}\n${content.trim()}\n${end}`
  const regex = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`, 'm')
  return regex.test(description) ? description.replace(regex, block) : `${description.trim()}\n\n${block}`
}

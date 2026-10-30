// Works out which CSV column plays which role, so the same pipeline handles
// "Total Raised" in one file and "Funding (£m)" in another.
//
// Approach: try header names first (cheap, predictable). If a role is still
// missing, look at the values themselves (e.g. a column full of URLs is the website).

import type { ColumnMapping, ColumnRole } from '#shared/types/blog'

type Row = Record<string, string>

const HEADER_PATTERNS: [ColumnRole, RegExp][] = [
  ['rank', /^(rank|ranking|#|no\.?|position)$/],
  ['website', /(website|url|domain|homepage|web ?site)/],
  ['description', /(description|summary|about|overview|what they do)/],
  ['amount', /(raised|funding|investment|invested|capital|amount|revenue|turnover|valuation)/],
  ['tags', /(industr|sector|categor|tags|vertical|sub-?sector|focus)/],
  ['region', /(region|location|city|area|hq|headquarter|country|county)/],
  ['stage', /(stage|round|series)/],
  ['size', /(employee|headcount|staff|team size|company size)/],
  ['year', /(founded|incorporat|established|year)/],
  // name last, so "Company website" or "Company description" are claimed first
  ['name', /(company|name|organi[sz]ation|business|startup|firm)/]
]

const normalise = (h: string) => h.toLowerCase().trim()

export function detectColumns(headers: string[], rows: Row[]): ColumnMapping {
  const mapping: ColumnMapping = {}
  const used = new Set<string>()

  // 1. Header names
  for (const [role, pattern] of HEADER_PATTERNS) {
    const match = headers.find(h => !used.has(h) && pattern.test(normalise(h)))
    if (match) {
      mapping[role] = match
      used.add(match)
    }
  }

  // 2. Value-based fallbacks for the roles that matter most
  const sample = rows.slice(0, 50)
  const unused = () => headers.filter(h => !used.has(h))
  const share = (h: string, test: (v: string) => boolean) => {
    const values = sample.map(r => r[h] ?? '').filter(v => v.trim() !== '')
    return values.length ? values.filter(test).length / values.length : 0
  }

  if (!mapping.website) {
    const h = unused().find(h => share(h, v => /^(https?:\/\/|www\.)/i.test(v.trim())) > 0.8)
    if (h) { mapping.website = h; used.add(h) }
  }
  if (!mapping.amount) {
    const h = unused().find(h => share(h, v => parseMoney(v) !== null && /\d{3,}|[£$€]|\d\s?[mkb]/i.test(v)) > 0.8)
    if (h) { mapping.amount = h; used.add(h) }
  }
  if (!mapping.name) {
    // first text column where nearly every value is different
    const h = unused().find(h => {
      const values = sample.map(r => r[h]?.trim()).filter(Boolean)
      return values.length > 0 && new Set(values).size / values.length > 0.95 && share(h, v => isNaN(Number(v))) > 0.9
    })
    if (h) { mapping.name = h; used.add(h) }
  }

  return mapping
}

/**
 * "£30,314,247" -> 30314247, "£12.5m" -> 12500000, "1.2bn" -> 1200000000.
 * headerHint lets "Funding (£m)" with value "12.5" become 12500000.
 */
export function parseMoney(raw: string | undefined, headerHint = ''): number | null {
  if (!raw) return null
  const v = raw.toLowerCase().replace(/[£$€,\s]/g, '')
  const m = v.match(/^(-?\d+(?:\.\d+)?)(k|m|mn|bn|b)?$/)
  if (!m) return null
  let n = parseFloat(m[1]!)
  const suffix = m[2]
  const hint = headerHint.toLowerCase()
  if (suffix === 'k') n *= 1e3
  else if (suffix === 'm' || suffix === 'mn') n *= 1e6
  else if (suffix === 'b' || suffix === 'bn') n *= 1e9
  else if (/\(\s*[£$€]?\s*(m|mn|millions?)\s*\)|£m|\$m|€m|millions/.test(hint)) n *= 1e6
  else if (/\(\s*[£$€]?\s*(bn|billions?)\s*\)/.test(hint)) n *= 1e9
  else if (/\(\s*[£$€]?\s*(k|thousands?)\s*\)/.test(hint)) n *= 1e3
  return n
}

/**
 * Tags arrive as "Banking; Payment processing". Some tags contain commas
 * ("Wealth, asset and investment management"), so only split on commas
 * when no row uses semicolons.
 */
export function pickTagSeparator(values: string[]): string {
  return values.some(v => v.includes(';')) ? ';' : values.some(v => v.includes('|')) ? '|' : ','
}

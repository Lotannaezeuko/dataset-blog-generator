// Turns raw CSV rows into clean CompanyRow objects using the detected mapping.

import type { ColumnMapping, CompanyRow } from '#shared/types/blog'
import { parseMoney, pickTagSeparator } from './columns'

type Row = Record<string, string>

const clean = (v: string | undefined) => {
  const t = v?.trim()
  return t && !/^(n\/?a|null|none|-|unknown)$/i.test(t) ? t : null
}

export function normaliseRows(rows: Row[], mapping: ColumnMapping): CompanyRow[] {
  const sep = mapping.tags ? pickTagSeparator(rows.map(r => r[mapping.tags!] ?? '')) : ';'

  const companies = rows
    .map((r, i): CompanyRow => {
      const get = (role: keyof ColumnMapping) => (mapping[role] ? clean(r[mapping[role]!]) : null)
      const rank = Number(get('rank'))
      const year = Number(get('year')?.slice(0, 4))
      const website = get('website')
      return {
        rank: Number.isFinite(rank) && rank > 0 ? rank : i + 1,
        name: get('name') ?? `Company ${i + 1}`,
        amount: parseMoney(get('amount') ?? undefined, mapping.amount),
        region: get('region'),
        stage: get('stage'),
        size: get('size'),
        year: year > 1800 && year < 2100 ? year : null,
        description: get('description'),
        website: website && !/^https?:\/\//i.test(website) ? `https://${website}` : website,
        tags: (get('tags') ?? '').split(sep).map(t => t.trim()).filter(Boolean)
      }
    })
    .filter(c => c.name.trim() !== '')

  // If there was no rank column, rank by amount so the table still means something
  if (!mapping.rank && mapping.amount) {
    companies.sort((a, b) => (b.amount ?? -1) - (a.amount ?? -1))
    companies.forEach((c, i) => (c.rank = i + 1))
  }
  return companies.sort((a, b) => a.rank - b.rank)
}

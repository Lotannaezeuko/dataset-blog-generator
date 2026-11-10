// The methodology section: how the ranking was built and what the data did and
// didn't cover. Written entirely in code from the dataset, with no LLM, so it is
// always accurate about the source, its gaps, and how figures were calculated.

import type { ColumnMapping, CompanyRow } from '#shared/types/blog'

interface MethodologyInput {
  industry: string
  geography: string
  sourceFile: string
  mapping: ColumnMapping
  amountLabel: string | null
  rows: CompanyRow[]
  rawRows: Record<string, string>[]
}

export function buildMethodology(m: MethodologyInput): string[] {
  const n = m.rows.length
  const amount = (m.amountLabel ?? 'funding').toLowerCase()
  const out: string[] = []

  // What the ranking is and how it is ordered.
  const order = m.mapping.rank
    ? `in the order given by the source's "${m.mapping.rank}" column`
    : m.mapping.amount
      ? `by ${amount}, highest first`
      : 'in the order of the source file'
  out.push(`This ranking covers ${n} ${m.geography} ${m.industry} companies from ${m.sourceFile}, listed ${order}.`)

  // Gaps: missing values within a column, then whole columns that weren't there.
  const gaps: string[] = []
  if (m.mapping.amount) {
    const missing = m.rows.filter(r => r.amount === null).length
    if (missing) gaps.push(`${missing} of the ${n} companies have no ${amount} figure and are left out of the funding statistics.`)
  }
  if (m.mapping.region) {
    const missing = m.rows.filter(r => r.region === null).length
    if (missing) gaps.push(`${missing} ${missing === 1 ? 'has' : 'have'} no location and ${missing === 1 ? 'is' : 'are'} left out of the regional breakdown.`)
  }
  const absent = [
    !m.mapping.amount && 'funding',
    !m.mapping.region && 'location',
    !m.mapping.tags && 'sector',
    !m.mapping.size && 'company size'
  ].filter(Boolean) as string[]
  if (absent.length) gaps.push(`The source has no ${joinOr(absent)} data, so ${absent.length === 1 ? 'that section is' : 'those sections are'} omitted.`)
  if (gaps.length) out.push(gaps.join(' '))

  // How amounts were read and summarised.
  if (m.mapping.amount) {
    const foreign = m.rawRows.filter(r => /[$€]/.test(r[m.mapping.amount!] ?? '')).length
    out.push(
      `Totals, medians and averages are calculated over companies with a ${amount} figure, and rounded for display; the table shows exact amounts.` +
      (foreign ? ` ${foreign} ${foreign === 1 ? 'amount was' : 'amounts were'} given in another currency and ${foreign === 1 ? 'is' : 'are'} shown in pounds without conversion.` : '')
    )
  }

  out.push('Every figure on this page is calculated directly from the source data.')
  return out
}

/** ["a", "b", "c"] -> "a, b or c" */
const joinOr = (items: string[]) => items.length > 1 ? `${items.slice(0, -1).join(', ')} or ${items.at(-1)}` : items[0]!

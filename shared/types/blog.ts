// Types shared by the server (which builds blogs) and the app (which renders them).

/** The jobs a CSV column can do. Detection maps real headers onto these. */
export type ColumnRole =
  | 'rank'
  | 'name'
  | 'amount'
  | 'region'
  | 'stage'
  | 'size'
  | 'year'
  | 'description'
  | 'website'
  | 'tags'

/** e.g. { name: 'Company', amount: 'Total Raised' } */
export type ColumnMapping = Partial<Record<ColumnRole, string>>

/** One company after cleaning, whatever the original CSV looked like. */
export interface CompanyRow {
  rank: number
  name: string
  amount: number | null
  region: string | null
  stage: string | null
  size: string | null
  year: number | null
  description: string | null
  website: string | null
  tags: string[]
}

export interface CountItem {
  label: string
  count: number
}

export interface DatasetStats {
  count: number
  amountLabel: string | null // the original header, e.g. "Total Raised"
  funding: {
    total: number
    mean: number
    median: number
    top: { name: string; amount: number }
    bottom: { name: string; amount: number }
    top10Share: number // 0 to 1
    bands: CountItem[]
  } | null
  regions: {
    distinct: number
    leader: CountItem
    leaderShare: number
    counts: CountItem[]
    avgByRegion: { label: string; avg: number; count: number }[]
  } | null
  tags: {
    distinct: number
    top: CountItem[]
    nearUniversal: string[] // tags on 90%+ of rows, too common to be interesting
  } | null
  sizes: CountItem[] | null
  stages: CountItem[] | null
  years: { median: number; oldest: number; newest: number } | null
}

/** The prose. Written by Gemini, or by the template fallback. */
export interface BlogCopy {
  seoTitle: string // <title>, aim for 60 characters or fewer
  metaDescription: string // aim for 155 characters or fewer
  h1: string
  intro: string
  fundingInsight?: string
  regionInsight?: string
  sectorInsight?: string
  sizeInsight?: string
  conclusion: string
  faq: { question: string; answer: string }[]
}

export interface BlogRecord {
  slug: string
  industry: string // e.g. "Fintech"
  geography: string // e.g. "UK"
  sourceFile: string
  createdAt: string
  copySource: 'gemini' | 'template'
  mapping: ColumnMapping
  stats: DatasetStats
  copy: BlogCopy
  rows: CompanyRow[]
}

export type BlogSummary = Pick<
  BlogRecord,
  'slug' | 'industry' | 'geography' | 'createdAt' | 'copySource'
> & { title: string; description: string; count: number }

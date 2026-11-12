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
    count: number // companies with a funding figure; every funding stat covers only these
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
  findings: string[] // at most two headline sentences, the article's angle; empty if the data can't support any
  angles: SectionAngles
  notes: StoryNotes
}

/**
 * The same points as findings and angles, as a short note plus the figures,
 * not written up. Gemini gets these instead of the sentences, so it has to write
 * the prose itself rather than copy a sentence out.
 */
export interface StoryNote {
  point: string
  figures: Record<string, string>
}

export interface StoryNotes {
  findings: StoryNote[]
  funding: StoryNote | null
  regions: StoryNote | null
  sectors: StoryNote | null
  sizes: StoryNote | null
  profile: StoryNote | null
}

/**
 * One computed sentence per section saying what that section shows, so each
 * section makes a point instead of listing counts. null when the data can't
 * support a comparison. profile draws the sections together for the conclusion.
 */
export interface SectionAngles {
  funding: string | null
  regions: string | null
  sectors: string | null
  sizes: string | null
  profile: string | null
}

/** The prose. Written by Gemini, or by the template fallback. */
export interface BlogCopy {
  seoTitle: string // <title>, aim for 60 characters or fewer
  metaDescription: string // aim for 155 characters or fewer
  h1: string
  intro: string
  leaders?: string // the companies at the top: who they are and what they do
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
  methodology?: string[] // paragraphs written in code from the dataset; optional so older saved blogs still load
  rows: CompanyRow[]
}

export type BlogSummary = Pick<
  BlogRecord,
  'slug' | 'industry' | 'geography' | 'createdAt' | 'copySource'
> & { title: string; description: string; count: number }

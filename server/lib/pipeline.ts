// The whole CSV -> blog flow in one place. Read this file first.
//
//   raw rows -> detect columns -> clean rows -> compute stats -> write copy -> BlogRecord

import type { BlogRecord } from '#shared/types/blog'
import { detectColumns } from './columns'
import { normaliseRows } from './normalise'
import { computeStats } from './stats'
import { geminiCopy, templateCopy } from './copy'
import { makeSlug } from '../../shared/utils/format'

export interface PipelineInput {
  headers: string[]
  rows: Record<string, string>[]
  industry: string
  geography: string
  sourceFile: string
  gemini?: { apiKey: string; model: string }
}

export async function buildBlog(input: PipelineInput): Promise<BlogRecord> {
  const mapping = detectColumns(input.headers, input.rows)
  if (!mapping.name) {
    throw new Error(`Couldn't find a company name column. Headers were: ${input.headers.join(', ')}`)
  }

  const rows = normaliseRows(input.rows, mapping)
  // "Funding (£m)" -> "Funding": values are already converted to full pounds
  const amountLabel = mapping.amount?.replace(/\s*\([^)]*\)/g, '').trim() || null
  const stats = computeStats(rows, amountLabel)
  const ctx = {
    industry: input.industry,
    geography: input.geography,
    stats,
    topCompanies: rows.slice(0, 5).map(r => r.name)
  }

  let copy = templateCopy(ctx)
  let copySource: BlogRecord['copySource'] = 'template'
  if (input.gemini?.apiKey) {
    try {
      copy = await geminiCopy(ctx, input.gemini)
      copySource = 'gemini'
    } catch (err) {
      console.warn('[pipeline] Gemini failed, using template copy:', (err as Error).message)
    }
  }

  return {
    slug: makeSlug(input.industry, input.geography, rows.length),
    industry: input.industry,
    geography: input.geography,
    sourceFile: input.sourceFile,
    createdAt: new Date().toISOString(),
    copySource,
    mapping,
    stats,
    copy,
    rows
  }
}

// Run with: npm test
// These check the part that matters most in the demo: an unseen CSV still works.
import { readFileSync } from 'node:fs'
import Papa from 'papaparse'
import { describe, expect, it } from 'vitest'
import { detectColumns, parseMoney } from '../server/lib/columns'
import { normaliseRows } from '../server/lib/normalise'
import { computeStats } from '../server/lib/stats'
import { templateCopy } from '../server/lib/copy'
import { buildBlog } from '../server/lib/pipeline'

const load = (file: string) => {
  const res = Papa.parse<Record<string, string>>(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8'), {
    header: true,
    skipEmptyLines: true
  })
  return { headers: res.meta.fields ?? [], rows: res.data }
}

describe('parseMoney', () => {
  it('handles the formats we expect to see', () => {
    expect(parseMoney('£30,314,247')).toBe(30314247)
    expect(parseMoney('£12.5m')).toBe(12_500_000)
    expect(parseMoney('1.2bn')).toBe(1_200_000_000)
    expect(parseMoney('12.5', 'Funding (£m)')).toBe(12_500_000)
    expect(parseMoney('N/A')).toBeNull()
  })
})

describe('fintech seed', () => {
  const { headers, rows } = load('fintech.csv')
  const mapping = detectColumns(headers, rows)

  it('maps every column', () => {
    expect(mapping).toEqual({
      rank: 'Rank', name: 'Company', region: 'Region', stage: 'Stage', size: 'Employees',
      amount: 'Total Raised', description: 'Description', website: 'Website', tags: 'Industries'
    })
  })

  it('computes the right headline stats', () => {
    const stats = computeStats(normaliseRows(rows, mapping), mapping.amount!)
    expect(stats.count).toBe(100)
    expect(stats.funding!.total).toBe(622_301_270)
    expect(stats.funding!.top.name).toBe('Nevis')
    expect(stats.regions!.leader).toEqual({ label: 'London', count: 78 })
    // "Wealth, asset and investment management" must stay one tag, not split on its commas
    expect(stats.tags!.top.map(t => t.label)).toContain('Wealth, asset and investment management')
  })
})

describe('a differently shaped dataset', () => {
  const { headers, rows } = load('healthtech_messy.csv')
  const mapping = detectColumns(headers, rows)

  it('finds columns with different names', () => {
    expect(mapping.name).toBe('Organisation')
    expect(mapping.amount).toBe('Funding (£m)')
    expect(mapping.tags).toBe('Sector')
    expect(mapping.region).toBe('HQ Location')
    expect(mapping.year).toBe('Founded')
  })

  it('ranks by funding when there is no rank column, and copes with blanks', () => {
    const companies = normaliseRows(rows, mapping)
    expect(companies[0]!.rank).toBe(1)
    expect(companies[0]!.amount).toBeGreaterThanOrEqual(companies[1]!.amount ?? 0)
    const stats = computeStats(companies, mapping.amount!)
    expect(stats.sizes).toBeNull() // no employees column, so that section disappears
    expect(stats.years).not.toBeNull()
  })
})

// An industry we've never seen, with headers that share no words with the other two.
describe('unfamiliar headers', () => {
  const { headers, rows } = load('ai_alt_headers.csv')
  const mapping = detectColumns(headers, rows)
  const companies = normaliseRows(rows, mapping)
  const byName = (name: string) => companies.find(c => c.name === name)!

  it('fills every role from header names it has never seen', () => {
    expect(mapping).toEqual({
      name: 'Entity', region: 'HQ City', amount: 'Cash Raised',
      tags: 'Verticals', size: 'Team Size', stage: 'Round', year: 'Founded'
    })
  })

  it('finds the name column from its values when the header gives no clue', () => {
    // "Entity" matches none of the name patterns, so this came from the value-based
    // fallback: a text column where nearly every value is unique.
    expect(mapping.name).toBe('Entity')
  })

  it('reads every money format in the file', () => {
    expect(byName('Helix Vision').amount).toBe(12_500_000) // $12.5m
    expect(byName('Tacitus AI').amount).toBe(8_400_000) // £8,400,000
    expect(byName('Orrery Labs').amount).toBe(1_100_000_000) // £1.1bn
    expect(byName('Nullspace').amount).toBe(950_000) // 950k, no symbol
    expect(byName('Byline NLP').amount).toBe(640_000) // £640k
    expect(byName('Cadence Robotics').amount).toBeNull() // "N/A"
    expect(byName('Parse & Patch').amount).toBeNull() // blank
  })

  it('splits tags on semicolons so a tag containing a comma survives', () => {
    expect(byName('Parse & Patch').tags).toEqual(['Natural language, speech and text', 'Developer tooling'])
  })

  it('ranks by amount and leaves a blank region null', () => {
    expect(companies[0]!.name).toBe('Orrery Labs')
    expect(companies.map(c => c.rank)).toEqual([...Array(12).keys()].map(i => i + 1))
    expect(byName('Latent Health').region).toBeNull()
  })

  it('computes stats over the rows that have an amount', () => {
    const stats = computeStats(companies, mapping.amount!)
    expect(stats.count).toBe(12) // all 12 listed, including the two with no amount
    expect(stats.funding!.total).toBe(1_410_840_000)
    expect(stats.funding!.top).toEqual({ name: 'Orrery Labs', amount: 1_100_000_000 })
    expect(stats.funding!.bottom).toEqual({ name: 'Byline NLP', amount: 640_000 })
    expect(stats.regions!.leader).toEqual({ label: 'London', count: 4 })
  })
})

// The worst case for the demo: a CSV with nothing but names and a description.
describe('a dataset with almost no columns', () => {
  const { headers, rows } = load('cleantech_sparse.csv')
  const mapping = detectColumns(headers, rows)
  const companies = normaliseRows(rows, mapping)
  const stats = computeStats(companies, mapping.amount ?? null)

  it('detects only the columns that are there', () => {
    expect(mapping).toEqual({ name: 'Startup', description: 'What they do' })
  })

  it('still lists every company, in file order', () => {
    expect(companies).toHaveLength(8)
    expect(companies[0]!.name).toBe('Gale & Co')
    expect(companies[0]!.rank).toBe(1)
  })

  it('returns null for every section the data cannot support', () => {
    expect(stats.count).toBe(8)
    expect(stats.funding).toBeNull()
    expect(stats.regions).toBeNull()
    expect(stats.tags).toBeNull()
    expect(stats.sizes).toBeNull()
    expect(stats.stages).toBeNull()
    expect(stats.years).toBeNull()
  })

  it('still produces a complete page of copy', () => {
    const copy = templateCopy({ industry: 'Cleantech', geography: 'UK', stats, topCompanies: companies.slice(0, 5).map(c => c.name) })
    expect(copy.h1).toContain('Cleantech')
    expect(copy.seoTitle).toBeTruthy()
    expect(copy.metaDescription).toBeTruthy()
    expect(copy.intro).toBeTruthy()
    expect(copy.conclusion).toBeTruthy()
    // The insight paragraphs drop out with the sections they describe...
    expect(copy.fundingInsight).toBeUndefined()
    expect(copy.regionInsight).toBeUndefined()
    // ...but the FAQ is never empty, or the FAQPage structured data would be invalid.
    expect(copy.faq.length).toBeGreaterThan(0)
    expect(copy.faq[0]!.answer).toContain('8')
  })
})

describe('buildBlog end to end', () => {
  it('turns a brand new CSV into a finished record with no Gemini key', async () => {
    const { headers, rows } = load('ai_alt_headers.csv')
    const blog = await buildBlog({ headers, rows, industry: 'AI', geography: 'UK', sourceFile: 'ai_alt_headers.csv' })

    expect(blog.slug).toBe('top-12-uk-ai')
    expect(blog.copySource).toBe('template') // no key passed, so the fallback copy is used
    expect(blog.rows).toHaveLength(12)
    expect(blog.stats.funding!.top.name).toBe('Orrery Labs')
    expect(blog.copy.h1).toContain('AI')
    expect(blog.mapping.name).toBe('Entity')
  })

  it('fails with a readable message when there is no name column', async () => {
    await expect(buildBlog({
      headers: ['Qty', 'Price'],
      rows: [{ Qty: '2', Price: '4' }, { Qty: '3', Price: '9' }],
      industry: 'Widgets', geography: 'UK', sourceFile: 'x.csv'
    })).rejects.toThrow(/name column/i)
  })
})

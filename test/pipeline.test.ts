// Run with: npm test
// These check the part that matters most in the demo: an unseen CSV still works.
import { readFileSync } from 'node:fs'
import Papa from 'papaparse'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectColumns, parseMoney } from '../server/lib/columns'
import { normaliseRows } from '../server/lib/normalise'
import { computeStats } from '../server/lib/stats'
import { buildFacts, geminiCopy, searchQueries, templateCopy } from '../server/lib/copy'
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

  it('builds a search query for every section the data supports, and the FAQ answers them', () => {
    const companies = normaliseRows(rows, mapping)
    const ctx = { industry: 'Fintech', geography: 'UK', stats: computeStats(companies, mapping.amount!), topCompanies: companies.slice(0, 5).map(c => c.name) }
    const queries = searchQueries(ctx)
    expect(queries.map(q => q.question)).toEqual([
      'What are the top Fintech companies in the UK?',
      'Which UK Fintech company has raised the most?',
      'How much funding have UK Fintech companies raised?',
      'Where are Fintech companies in the UK based?',
      'What do UK Fintech companies specialise in?'
    ])
    expect(queries[1]!.answer).toBe('Nevis, with £30.3m raised.')
    expect(templateCopy(ctx).faq).toEqual(queries)
  })

  it('derives both key findings, with figures computed in code', () => {
    const stats = computeStats(normaliseRows(rows, mapping), mapping.amount!)
    expect(stats.findings).toEqual([
      'The ten best-funded companies hold 33% of all funding in the ranking, and Nevis has raised 7.3 times the median of £4.1m.',
      'London is home to 78 of the 100 companies (78%).'
    ])
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

  it('says funding totals cover only the companies with a figure', () => {
    // 2 of the 30 have no funding, so "the 30 companies raised £567m" would be wrong.
    const companies = normaliseRows(rows, mapping)
    const stats = computeStats(companies, mapping.amount!)
    const ctx = { industry: 'Healthtech', geography: 'UK', stats, topCompanies: companies.slice(0, 5).map(c => c.name) }
    expect(stats.funding!.count).toBe(28)
    expect(buildFacts(ctx).funding!.coversOnly).toBe('the 28 companies with a funding figure')
    const copy = templateCopy(ctx)
    expect(copy.intro).toContain('The 28 companies with a funding figure have raised £567m between them.')
    expect(copy.conclusion).toMatch(/^The 28 companies with a funding figure have raised £567m/)
    expect(copy.faq[2]!.answer).toMatch(/^The 28 companies with a funding figure/)
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

  it('skips the concentration finding with only ten funded companies', () => {
    // Ten funded companies means "the top ten" is all of them, so no concentration
    // finding. One company has no city, so the region finding says so.
    const stats = computeStats(companies, mapping.amount!)
    expect(stats.findings).toEqual(['London is home to 4 of the 11 companies with a known location (36%).'])
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
    expect(stats.findings).toEqual([])
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
    // Only the query the data can answer survives: no funding, region or sector questions.
    expect(copy.faq.map(f => f.question)).toEqual(['What are the top Cleantech companies in the UK?'])
    expect(copy.faq[0]!.answer).toContain('8')
  })
})

// Gemini itself is never called: $fetch is stubbed, so these run offline.
describe('geminiCopy retries', () => {
  const ctx = { industry: 'AI', geography: 'UK', stats: computeStats([], null), topCompanies: [] }
  const reply = { steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify({ h1: 'Headline', intro: 'Intro' }) }] }] }
  const failure = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status, data: { error: { message: `status ${status}` } } })
  afterEach(() => vi.unstubAllGlobals())

  it('retries a 503 (model overloaded) and then succeeds', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(failure(503)).mockResolvedValueOnce(reply)
    vi.stubGlobal('$fetch', fetch)
    const copy = await geminiCopy(ctx, { apiKey: 'k', model: 'm', retryDelaysMs: [0, 0] })
    expect(copy.h1).toBe('Headline')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('gives up after the last retry', async () => {
    const fetch = vi.fn().mockRejectedValue(failure(503))
    vi.stubGlobal('$fetch', fetch)
    await expect(geminiCopy(ctx, { apiKey: 'k', model: 'm', retryDelaysMs: [0, 0] })).rejects.toThrow(/status 503/)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('does not retry errors that will not clear on their own', async () => {
    const fetch = vi.fn().mockRejectedValue(failure(400))
    vi.stubGlobal('$fetch', fetch)
    await expect(geminiCopy(ctx, { apiKey: 'k', model: 'm', retryDelaysMs: [0, 0] })).rejects.toThrow(/status 400/)
    expect(fetch).toHaveBeenCalledTimes(1)
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

  it('writes a methodology that states the gaps in the data', async () => {
    const { headers, rows } = load('ai_alt_headers.csv')
    const blog = await buildBlog({ headers, rows, industry: 'AI', geography: 'UK', sourceFile: 'ai_alt_headers.csv' })
    expect(blog.methodology).toEqual([
      'This ranking covers 12 UK AI companies from ai_alt_headers.csv, listed by cash raised, highest first.',
      '2 of the 12 companies have no cash raised figure and are left out of the funding statistics. 1 has no location and is left out of the regional breakdown.',
      'Totals, medians and averages are calculated over companies with a cash raised figure, and rounded for display; the table shows exact amounts. 2 amounts were given in another currency and are shown in pounds without conversion.',
      'Every figure on this page is calculated directly from the source data.'
    ])
  })

  it('says which sections are missing when columns are absent', async () => {
    const { headers, rows } = load('cleantech_sparse.csv')
    const blog = await buildBlog({ headers, rows, industry: 'Cleantech', geography: 'UK', sourceFile: 'cleantech_sparse.csv' })
    expect(blog.methodology![1]).toBe('The source has no funding, location, sector or company size data, so those sections are omitted.')
  })

  it('fails with a readable message when there is no name column', async () => {
    await expect(buildBlog({
      headers: ['Qty', 'Price'],
      rows: [{ Qty: '2', Price: '4' }, { Qty: '3', Price: '9' }],
      industry: 'Widgets', geography: 'UK', sourceFile: 'x.csv'
    })).rejects.toThrow(/name column/i)
  })
})

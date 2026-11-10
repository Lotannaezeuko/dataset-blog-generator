// Generates the fintech, healthtech and cleantech blogs through the real pipeline
// and writes each one's copy to samples/<label>/<industry>.md, so the output of
// different prompt versions can be compared side by side.
//
//   npm run samples -- baseline
//
// Uses NUXT_GEMINI_API_KEY from .env if set; otherwise the template copy.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import Papa from 'papaparse'
import { ofetch } from 'ofetch'
import type { BlogRecord } from '../shared/types/blog'
import { buildBlog } from '../server/lib/pipeline'

// copy.ts calls Nuxt's global $fetch; outside Nuxt, provide it.
;(globalThis as any).$fetch = ofetch
try { process.loadEnvFile('.env') } catch {}

const label = process.argv[2] ?? 'latest'
const apiKey = process.env.NUXT_GEMINI_API_KEY
const model = process.env.NUXT_GEMINI_MODEL || 'gemini-3.5-flash-lite'

const DATASETS = [
  { industry: 'Fintech', file: 'server/assets/seed/fintech.csv' },
  { industry: 'Healthtech', file: 'test/fixtures/healthtech_messy.csv' },
  { industry: 'Cleantech', file: 'test/fixtures/cleantech_sparse.csv' }
]

function toMarkdown(b: BlogRecord): string {
  const c = b.copy
  const lines = [
    `<!-- copySource: ${b.copySource} · generated ${b.createdAt} -->`,
    `**seoTitle:** ${c.seoTitle}  `,
    `**metaDescription:** ${c.metaDescription}`,
    '',
    `# ${c.h1}`,
    '',
    c.intro,
    ''
  ]
  const section = (heading: string, text?: string) => text && lines.push(`## ${heading}`, '', text, '')
  section('How funding is distributed', c.fundingInsight)
  section(`Where ${b.industry} companies are based`, c.regionInsight)
  section('The most common sectors', c.sectorInsight)
  section('Company size', c.sizeInsight)
  if (c.faq.length) {
    lines.push('## Frequently asked questions', '')
    for (const f of c.faq) lines.push(`### ${f.question}`, '', f.answer, '')
  }
  section('Summary', c.conclusion)
  section('Methodology', b.methodology?.join('\n\n'))
  return lines.join('\n')
}

const dir = `samples/${label}`
mkdirSync(dir, { recursive: true })

for (const d of DATASETS) {
  const parsed = Papa.parse<Record<string, string>>(readFileSync(d.file, 'utf8'), { header: true, skipEmptyLines: true })
  const blog = await buildBlog({
    headers: parsed.meta.fields ?? [],
    rows: parsed.data,
    industry: d.industry,
    geography: 'UK',
    sourceFile: d.file.split('/').pop()!,
    gemini: apiKey ? { apiKey, model } : undefined
  })
  const out = `${dir}/${d.industry.toLowerCase()}.md`
  writeFileSync(out, toMarkdown(blog))
  console.log(`${out}  (${blog.copySource})`)
}

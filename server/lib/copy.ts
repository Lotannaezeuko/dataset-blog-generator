// Blog prose. Gemini writes it from the computed stats; if Gemini isn't
// configured, fails, or returns something unusable, the template version is used,
// so a page is always generated.

import type { BlogCopy, DatasetStats } from '#shared/types/blog'
import { formatGBP, formatPct } from '../../shared/utils/format'

interface CopyContext {
  industry: string
  geography: string
  stats: DatasetStats
  topCompanies: string[] // top 5 names, so the copy can mention real examples
}

// ---------- 1. Facts: the only material the LLM is allowed to use ----------

export function buildFacts({ industry, geography, stats, topCompanies }: CopyContext) {
  const f = stats.funding, r = stats.regions, t = stats.tags
  return {
    industry,
    geography,
    companiesRanked: stats.count,
    rankedBy: stats.amountLabel ?? 'the dataset order',
    topCompanies,
    funding: f && {
      total: formatGBP(f.total),
      median: formatGBP(f.median),
      average: formatGBP(f.mean),
      largest: `${f.top.name} (${formatGBP(f.top.amount)})`,
      smallestInList: formatGBP(f.bottom.amount),
      top10ShareOfTotal: formatPct(f.top10Share)
    },
    regions: r && {
      distinctRegions: r.distinct,
      leadingRegion: `${r.leader.label} (${r.leader.count} companies, ${formatPct(r.leaderShare)})`,
      breakdown: r.counts.slice(0, 5).map(x => `${x.label}: ${x.count}`)
    },
    sectors: t && {
      mostCommon: t.top.slice(0, 5).map(x => `${x.label}: ${x.count}`),
      tooCommonToMention: t.nearUniversal
    },
    companySizes: stats.sizes?.map(x => `${x.label} employees: ${x.count}`) ?? null,
    stages: stats.stages?.map(x => `${x.label}: ${x.count}`) ?? null,
    foundingYears: stats.years
  }
}

// ---------- 2. Template fallback ----------

export function templateCopy(ctx: CopyContext): BlogCopy {
  const { industry, geography, stats } = ctx
  const f = stats.funding, r = stats.regions, t = stats.tags
  const year = new Date().getFullYear()
  const singleStage = stats.stages?.length === 1 ? `${stats.stages[0]!.label.toLowerCase()}-stage ` : ''

  return {
    seoTitle: `Top ${stats.count} ${geography} ${industry} Companies (${year})`,
    metaDescription: f
      ? `The top ${stats.count} ${singleStage}${geography} ${industry} companies, ranked by ${(stats.amountLabel ?? 'funding').toLowerCase()}. Together they have raised ${formatGBP(f.total)}.`
      : `The top ${stats.count} ${geography} ${industry} companies, with key statistics and a full ranking table.`,
    h1: `The top ${stats.count} ${singleStage}${industry} companies in the ${geography}`,
    intro: `This ranking covers ${stats.count} ${singleStage}${industry} companies in the ${geography}${f ? `, which have raised ${formatGBP(f.total)} between them` : ''}. Below you'll find the full table, where the money has gone, and which sectors and regions stand out.`,
    fundingInsight: f
      ? `${f.top.name} leads the list with ${formatGBP(f.top.amount)} raised. The median company has raised ${formatGBP(f.median)}, and the top ten account for ${formatPct(f.top10Share)} of all funding in the list.`
      : undefined,
    regionInsight: r
      ? `${r.leader.label} is home to ${r.leader.count} of the companies (${formatPct(r.leaderShare)}), with the rest spread across ${r.distinct - 1} other regions.`
      : undefined,
    sectorInsight: t?.top.length
      ? `The most common focus areas are ${t.top.slice(0, 3).map(x => x.label.toLowerCase()).join(', ')}.`
      : undefined,
    sizeInsight: stats.sizes
      ? `The most common company size is ${[...stats.sizes].sort((a, b) => b.count - a.count)[0]!.label} employees.`
      : undefined,
    conclusion: `${industry} in the ${geography} continues to attract investment. Use the table above to explore every company in the ranking.`,
    faq: [
      // Always answerable: every dataset has a count, so the FAQ section is never empty.
      {
        question: `How many ${geography} ${industry} companies are in this ranking?`,
        answer: `${stats.count}${stats.amountLabel ? `, ranked by ${stats.amountLabel.toLowerCase()}` : ''}. The full list is in the table above.`
      },
      ...(f ? [{ question: `Which ${geography} ${industry} company has raised the most?`, answer: `${f.top.name}, with ${formatGBP(f.top.amount)} raised.` }] : []),
      ...(r ? [{ question: `Where are most ${industry} companies based?`, answer: `${r.leader.label}, with ${r.leader.count} of the ${stats.count} companies in this list.` }] : [])
    ]
  }
}

// ---------- 3. Gemini ----------

// JSON Schema for the copy we want back, so Gemini can't return prose or stray fields.
const SCHEMA = {
  type: 'object',
  properties: {
    seoTitle: { type: 'string' },
    metaDescription: { type: 'string' },
    h1: { type: 'string' },
    intro: { type: 'string' },
    fundingInsight: { type: 'string' },
    regionInsight: { type: 'string' },
    sectorInsight: { type: 'string' },
    sizeInsight: { type: 'string' },
    conclusion: { type: 'string' },
    faq: {
      type: 'array',
      items: {
        type: 'object',
        properties: { question: { type: 'string' }, answer: { type: 'string' } },
        required: ['question', 'answer']
      }
    }
  },
  required: ['seoTitle', 'metaDescription', 'h1', 'intro', 'conclusion', 'faq']
}

function buildPrompt(facts: ReturnType<typeof buildFacts>): string {
  return `You write SEO blog copy for a UK company-data platform.

Write copy for a ranking page about ${facts.companiesRanked} ${facts.geography} ${facts.industry} companies.

Rules:
- Use ONLY the facts in the JSON below. Do not invent numbers, companies or claims.
- Copy figures exactly as written in the facts.
- Write in British English throughout: organisation, specialise, analyse, centre.
- Plain, factual prose. No hype words and no marketing language.
- Write about the companies, not about us. Never say "our platform", "our records"
  or "our dataset"; if you need to name the ordering, say "the ranking" or "the list".
- seoTitle: under 60 characters, include "${facts.industry}", "${facts.geography}" and the year ${new Date().getFullYear()}.
- metaDescription: 140 to 155 characters, includes one concrete figure.
- h1: natural headline, can differ from seoTitle.
- intro: 2 short paragraphs.
- Each *Insight field: 2 to 3 sentences on that facts section. Omit a field if its facts are null.
- faq: 3 questions people would search for, answered from the facts.

Facts:
${JSON.stringify(facts, null, 2)}`
}

export async function geminiCopy(
  ctx: CopyContext,
  opts: { apiKey: string; model: string; timeoutMs?: number }
): Promise<BlogCopy> {
  // Google's Interactions API. It replaced models/{model}:generateContent, which
  // still exists but whose Gemini 2.5 models are closed to new API keys.
  let res: any
  try {
    res = await $fetch<any>('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'x-goog-api-key': opts.apiKey },
      // An explicit signal, not ofetch's `timeout`, because the request must be
      // bounded even if Gemini accepts the connection and then stalls without
      // replying. retry: 0 so a slow call isn't attempted again and again.
      signal: AbortSignal.timeout(opts.timeoutMs ?? 45_000),
      retry: 0,
      body: {
        model: opts.model,
        input: buildPrompt(buildFacts(ctx)),
        // Asks for JSON matching SCHEMA, so the reply can be parsed straight into BlogCopy.
        response_format: { type: 'text', mime_type: 'application/json', schema: SCHEMA }
      }
    })
  } catch (err: any) {
    // Google explains refusals in the response body (model withdrawn, quota, bad
    // key). Without this you only see "404 Not Found", which isn't enough to fix it.
    const detail = err?.data?.error?.message
    throw new Error(detail ? `Gemini (${opts.model}): ${detail}` : err?.message ?? String(err))
  }

  // The reply is a list of steps; the model's answer is the "model_output" one.
  // Thinking models also return "thought" steps, so find the step rather than index it.
  const text = res?.steps
    ?.find((s: any) => s?.type === 'model_output')
    ?.content?.find((c: any) => c?.type === 'text')?.text
  if (!text) throw new Error(`Gemini returned no text (status: ${res?.status ?? 'unknown'})`)
  return validateCopy(JSON.parse(text), ctx)
}

/**
 * Keep Gemini honest: required fields present, and lengths sensible.
 * Spreading the template first means any field the model omitted or returned
 * over-length falls back to the computed version rather than rendering empty.
 */
function validateCopy(c: Partial<BlogCopy>, ctx: CopyContext): BlogCopy {
  const fallback = templateCopy(ctx)
  if (!c.h1 || !c.intro) throw new Error('Gemini copy missing required fields')
  return {
    ...fallback,
    ...c,
    seoTitle: c.seoTitle && c.seoTitle.length <= 70 ? c.seoTitle : fallback.seoTitle,
    metaDescription: c.metaDescription && c.metaDescription.length <= 170 ? c.metaDescription : fallback.metaDescription,
    faq: Array.isArray(c.faq) && c.faq.length ? c.faq.slice(0, 5) : fallback.faq
  } as BlogCopy
}

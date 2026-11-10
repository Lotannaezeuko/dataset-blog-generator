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

/**
 * Who the funding figures describe. Companies with no amount are left out of
 * every funding stat, so "the 30 companies raised £567m" would be wrong when
 * only 28 had a figure.
 */
function fundedCompanies(stats: DatasetStats): string {
  const f = stats.funding!
  return f.count < stats.count ? `the ${f.count} companies with a funding figure` : `the ${stats.count} companies in this ranking`
}

const capitalise = (s: string) => s[0]!.toUpperCase() + s.slice(1)

// ---------- 1. Facts: the only material the LLM is allowed to use ----------

export function buildFacts({ industry, geography, stats, topCompanies }: CopyContext) {
  const f = stats.funding, r = stats.regions, t = stats.tags
  return {
    industry,
    geography,
    companiesRanked: stats.count,
    rankedBy: stats.amountLabel, // null when the file had no amount column, so the order is the file's own
    keyFindings: stats.findings,
    topCompanies,
    funding: f && {
      coversOnly: fundedCompanies(stats),
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

// ---------- 2. Search queries: what the FAQ must answer ----------

/**
 * The questions people search for about a ranking like this, built from the
 * industry and geography. A question is only included when the data can answer
 * it. Each carries an answer computed in code: the template uses it as-is, and
 * Gemini is given the questions and told to answer every one from the facts.
 */
export function searchQueries({ industry, geography, stats, topCompanies }: CopyContext): { question: string; answer: string }[] {
  const f = stats.funding, r = stats.regions, t = stats.tags
  const first = topCompanies.slice(0, 3)
  const queries = [
    {
      question: `What are the top ${industry} companies in the ${geography}?`,
      answer: `This ranking lists ${stats.count} ${geography} ${industry} companies${stats.amountLabel ? `, ranked by ${stats.amountLabel.toLowerCase()}` : ''}.` +
        `${first.length ? ` The first ${first.length === 1 ? 'is' : `${first.length === 2 ? 'two' : 'three'} are`} ${joinList(first)}.` : ''}`
    }
  ]
  if (f) {
    queries.push(
      { question: `Which ${geography} ${industry} company has raised the most?`, answer: `${f.top.name}, with ${formatGBP(f.top.amount)} raised.` },
      { question: `How much funding have ${geography} ${industry} companies raised?`, answer: `${capitalise(fundedCompanies(stats))} have raised ${formatGBP(f.total)} in total. The median is ${formatGBP(f.median)}.` }
    )
  }
  if (r) {
    const located = r.counts.reduce((s, x) => s + x.count, 0)
    queries.push({
      question: `Where are ${industry} companies in the ${geography} based?`,
      answer: `${r.leader.label} has the most: ${r.leader.count} of the ${located} companies${located < stats.count ? ' with a known location' : ''}. The rest are spread across ${r.distinct - 1} other regions.`
    })
  }
  if (t?.top.length) {
    queries.push({ question: `What do ${geography} ${industry} companies specialise in?`, answer: `The most common focus areas are ${joinList(t.top.slice(0, 3).map(x => x.label.toLowerCase()))}.` })
  }
  return queries
}

/** ["a", "b", "c"] -> "a, b and c". Semicolons if an item has its own commas. */
const joinList = (items: string[]) => {
  const sep = items.some(i => i.includes(',')) ? '; ' : ', '
  return items.length > 1 ? `${items.slice(0, -1).join(sep)} and ${items.at(-1)}` : items[0] ?? ''
}

// ---------- 3. Template fallback ----------

export function templateCopy(ctx: CopyContext): BlogCopy {
  const { industry, geography, stats } = ctx
  const f = stats.funding, r = stats.regions, t = stats.tags
  const year = new Date().getFullYear()
  const singleStage = stats.stages?.length === 1 ? `${stats.stages[0]!.label.toLowerCase()}-stage ` : ''
  const allFunded = f && f.count === stats.count

  return {
    seoTitle: `Top ${stats.count} ${geography} ${industry} Companies (${year})`,
    metaDescription: f
      ? `The top ${stats.count} ${singleStage}${geography} ${industry} companies, ranked by ${(stats.amountLabel ?? 'funding').toLowerCase()}. ` +
        (allFunded ? `Together they have raised ${formatGBP(f.total)}.` : `${capitalise(fundedCompanies(stats))} have raised ${formatGBP(f.total)}.`)
      : `The top ${stats.count} ${geography} ${industry} companies, with key statistics and a full ranking table.`,
    h1: `The top ${stats.count} ${singleStage}${industry} companies in the ${geography}`,
    intro: [
      `This ranking covers ${stats.count} ${singleStage}${industry} companies in the ${geography}` +
        (!f ? '.' : allFunded ? `, which have raised ${formatGBP(f.total)} between them.` : `. ${capitalise(fundedCompanies(stats))} have raised ${formatGBP(f.total)} between them.`),
      ...stats.findings
    ].join(' '),
    fundingInsight: f
      ? `${f.top.name} leads the list with ${formatGBP(f.top.amount)} raised. The median company has raised ${formatGBP(f.median)}, and the top ten account for ${formatPct(f.top10Share)} of all funding in the list.`
      : undefined,
    regionInsight: r
      ? `${r.leader.label} is home to ${r.leader.count} of the companies (${formatPct(r.leaderShare)}), with the rest spread across ${r.distinct - 1} other regions.`
      : undefined,
    sectorInsight: t?.top.length
      ? `The most common focus areas are ${joinList(t.top.slice(0, 3).map(x => `${x.label.toLowerCase()} (${x.count} companies)`))}.`
      : undefined,
    sizeInsight: stats.sizes
      ? (() => {
          const top = [...stats.sizes].sort((a, b) => b.count - a.count)[0]!
          return `The most common company size is ${top.label} employees, which covers ${top.count} of the ${stats.count} companies.`
        })()
      : undefined,
    // A summary of what the data shows, not a claim about where the industry is heading.
    conclusion: f
      ? `${capitalise(fundedCompanies(stats))} have raised ${formatGBP(f.total)} in total, with a median of ${formatGBP(f.median)}. The table lists every company, and the methodology explains how the figures were calculated.`
      : `The table lists all ${stats.count} companies, and the methodology explains how the ranking was compiled.`,
    // The first query is always answerable (every dataset has a count), so the FAQ is never empty.
    faq: searchQueries(ctx)
  }
}

// ---------- 4. Gemini ----------

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

function buildPrompt(facts: ReturnType<typeof buildFacts>, queries: string[]): string {
  return `You write SEO blog copy for a UK company-data platform.

Write copy for a ranking page about ${facts.companiesRanked} ${facts.geography} ${facts.industry} companies.

Rules:
- Use ONLY the facts in the JSON below. Do not invent numbers, companies or claims.
- Copy figures exactly as written in the facts.
- Write percentages as figures with a % sign, e.g. 37%, never "37 percent".
- Funding figures describe only funding.coversOnly, never all the companies ranked.
  Make that clear once in each paragraph that gives a funding total, median or
  average; do not repeat the phrase within a paragraph.
- keyFindings are the article's angle. Open the intro with the first finding, make
  each finding the point of the matching *Insight section, and return to them in
  the conclusion. They are written for you to restate, not paste: use your own
  wording each time, keeping the figures exact. If keyFindings is empty, lead with
  the size of the ranking.

Tone of voice:
- Authoritative but plain. Write like an analyst briefing a reader, not a marketer
  selling to one. Short, everyday words over jargon.
- Data-led. Every paragraph makes one point and supports it with a figure from the
  facts. Lead with the figure, then say what it shows.
- British English spelling and usage: organisation, specialise, analyse, centre, programme.
- Short paragraphs: at most three sentences each. Keep sentences under 25 words.
- No hype or filler. Never use: thriving, booming, cutting-edge, innovative,
  revolutionary, game-changing, exciting, unlock, landscape, "it is worth noting",
  "in today's", "to conclude". No exclamation marks or rhetorical questions.
- Describe what the data shows; do not speculate about why or predict what comes next.
- Do not copy a sentence word for word into more than one field. Restate a finding
  in fresh words, keeping its figures exact.
- Do not mention data that is missing; simply leave that topic out.
- Write about the companies, not about us. Never say "our platform", "our records"
  or "our dataset"; if you need to name the ordering, say "the ranking" or "the list".
- seoTitle: under 60 characters, include "${facts.industry}", "${facts.geography}" and the year ${new Date().getFullYear()}.
- metaDescription: 140 to 155 characters. A plain statement whose subject is the
  companies, e.g. "The top N ... companies ...": what is ranked, by what (if
  rankedBy is set), and one concrete figure from the facts. No call to action
  anywhere in it: never tell or invite the reader to do anything (no Explore,
  Discover, Review, See, Find out). No loaded words such as dominance or powerhouse.
- h1: natural headline, can differ from seoTitle.
- intro: 2 short paragraphs.
- Each *Insight field: 2 to 3 sentences on that facts section. Omit a field if its facts are null.
- faq: exactly one entry per target search query below, in the same order. Keep each
  question's meaning and its industry and geography terms. Start each answer with
  the direct answer, in 1 to 2 sentences, using only the facts.

Target search queries:
${queries.map(q => `- ${q}`).join('\n')}

Facts:
${JSON.stringify(facts, null, 2)}`
}

export async function geminiCopy(
  ctx: CopyContext,
  opts: { apiKey: string; model: string; timeoutMs?: number; retryDelaysMs?: number[] }
): Promise<BlogCopy> {
  // One time budget for the whole call, retries included, so a page never waits
  // longer than this for copy. An explicit signal, not ofetch's `timeout`, because
  // the request must be bounded even if Gemini accepts the connection and stalls.
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 45_000)
  // A 503 means the model is temporarily overloaded ("high demand"), which usually
  // clears within seconds, so it is retried after a short wait. Other errors (bad
  // key, quota, model withdrawn) won't fix themselves and fail straight away.
  const retryDelays = opts.retryDelaysMs ?? [2_000, 5_000]

  let res: any
  for (let attempt = 0; ; attempt++) {
    try {
      // Google's Interactions API. It replaced models/{model}:generateContent, which
      // still exists but whose Gemini 2.5 models are closed to new API keys.
      res = await $fetch<any>('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST',
        headers: { 'x-goog-api-key': opts.apiKey },
        signal,
        retry: 0, // retries are handled here, only for 503s
        body: {
          model: opts.model,
          input: buildPrompt(buildFacts(ctx), searchQueries(ctx).map(q => q.question)),
          // Asks for JSON matching SCHEMA, so the reply can be parsed straight into BlogCopy.
          response_format: { type: 'text', mime_type: 'application/json', schema: SCHEMA }
        }
      })
      break
    } catch (err: any) {
      const status = err?.status ?? err?.statusCode
      if (status === 503 && attempt < retryDelays.length && !signal.aborted) {
        console.warn(`[gemini] 503 overloaded, retrying in ${retryDelays[attempt]}ms`)
        await new Promise(r => setTimeout(r, retryDelays[attempt]))
        continue
      }
      // Google explains refusals in the response body (model withdrawn, quota, bad
      // key). Without this you only see "404 Not Found", which isn't enough to fix it.
      const detail = err?.data?.error?.message
      throw new Error(detail ? `Gemini (${opts.model}): ${detail}` : err?.message ?? String(err))
    }
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

// Every number on the page is computed here, in code.
// The LLM is only given these results to write about, so it can't invent figures.
// Each section is null when the dataset has no column for it.

import type { CompanyRow, CountItem, DatasetStats, SectionAngles, StoryNote, StoryNotes } from '#shared/types/blog'
import { formatGBP, formatPct } from '../../shared/utils/format'

function countBy(values: (string | null)[]): CountItem[] {
  const counts = new Map<string, number>()
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

// Funding bands on a rough log scale. Empty bands are dropped later.
const BANDS: [number, string][] = [
  [1e6, 'Under £1m'],
  [2.5e6, '£1m to £2.5m'],
  [5e6, '£2.5m to £5m'],
  [10e6, '£5m to £10m'],
  [25e6, '£10m to £25m'],
  [50e6, '£25m to £50m'],
  [100e6, '£50m to £100m'],
  [Infinity, '£100m or more']
]

/** "10-24" -> 10, "<5" -> 0, "250+" -> 250. Used to sort size bands sensibly. */
const bandStart = (label: string) => (label.startsWith('<') ? 0 : parseInt(label.replace(/[^\d].*$/, '').replace(/,/g, '')) || 0)

export function computeStats(rows: CompanyRow[], amountLabel: string | null): DatasetStats {
  const n = rows.length
  const funded = rows.filter(r => r.amount !== null) as (CompanyRow & { amount: number })[]

  let funding: DatasetStats['funding'] = null
  if (funded.length >= 3) {
    const byAmount = [...funded].sort((a, b) => b.amount - a.amount)
    const total = funded.reduce((s, r) => s + r.amount, 0)
    const top10 = byAmount.slice(0, 10).reduce((s, r) => s + r.amount, 0)
    const bands = BANDS.map(([max], i) => ({
      label: BANDS[i]![1],
      count: funded.filter(r => r.amount >= (i ? BANDS[i - 1]![0] : 0) && r.amount < max).length
    })).filter(b => b.count > 0)

    funding = {
      count: funded.length,
      total,
      mean: total / funded.length,
      median: median(funded.map(r => r.amount)),
      top: { name: byAmount[0]!.name, amount: byAmount[0]!.amount },
      bottom: { name: byAmount.at(-1)!.name, amount: byAmount.at(-1)!.amount },
      top10Share: total ? top10 / total : 0,
      bands
    }
  }

  let regions: DatasetStats['regions'] = null
  const regionCounts = countBy(rows.map(r => r.region))
  if (regionCounts.length) {
    const located = regionCounts.reduce((s, r) => s + r.count, 0)
    const avgByRegion = funding
      ? regionCounts
          .filter(r => r.count >= 3)
          .map(r => {
            const inRegion = funded.filter(c => c.region === r.label)
            return { label: r.label, count: inRegion.length, avg: inRegion.reduce((s, c) => s + c.amount, 0) / (inRegion.length || 1) }
          })
          .sort((a, b) => b.avg - a.avg)
      : []
    regions = {
      distinct: regionCounts.length,
      leader: regionCounts[0]!,
      leaderShare: regionCounts[0]!.count / located,
      counts: regionCounts,
      avgByRegion
    }
  }

  let tags: DatasetStats['tags'] = null
  const tagCounts = countBy(rows.flatMap(r => r.tags))
  if (tagCounts.length) {
    const nearUniversal = tagCounts.filter(t => t.count / n >= 0.9).map(t => t.label)
    tags = {
      distinct: tagCounts.length,
      top: tagCounts.filter(t => !nearUniversal.includes(t.label)).slice(0, 10),
      nearUniversal
    }
  }

  const sizeCounts = countBy(rows.map(r => r.size))
  const sizes = sizeCounts.length ? sizeCounts.sort((a, b) => bandStart(a.label) - bandStart(b.label)) : null

  const stageCounts = countBy(rows.map(r => r.stage))
  const stages = stageCounts.length ? stageCounts : null

  const yearList = rows.map(r => r.year).filter((y): y is number => y !== null)
  const years = yearList.length >= 3
    ? { median: Math.round(median(yearList)), oldest: Math.min(...yearList), newest: Math.max(...yearList) }
    : null

  const { findings, notes: findingNotes } = keyFindings(n, funding, funded.length, regions)
  const { angles, notes } = sectionAngles(rows, funded, funding, regions, tags, sizes)

  return {
    count: n, amountLabel, funding, regions, tags, sizes, stages, years,
    findings, angles, notes: { findings: findingNotes, ...notes }
  }
}

/** True when two figures are within 10% of each other, too close to call a difference. */
const compare = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b) < 0.1

/**
 * One sentence per section that makes a comparison rather than a count, so the
 * section has a point to make. Every figure is computed here. Each is null when
 * there isn't enough data for the comparison to mean anything (fewer than five
 * companies on either side), and the copy then falls back to describing the counts.
 *
 * Each sentence comes with a note: the same point and figures, but not written up.
 * The template uses the sentences; Gemini gets the notes, because given a finished
 * sentence it copies it word for word instead of writing.
 */
function sectionAngles(
  rows: CompanyRow[],
  funded: (CompanyRow & { amount: number })[],
  funding: DatasetStats['funding'],
  regions: DatasetStats['regions'],
  tags: DatasetStats['tags'],
  sizes: CountItem[] | null
): { angles: SectionAngles; notes: Omit<StoryNotes, 'findings'> } {
  const angles: SectionAngles = { funding: null, regions: null, sectors: null, sizes: null, profile: null }
  const notes: Omit<StoryNotes, 'findings'> = { funding: null, regions: null, sectors: null, sizes: null, profile: null }

  // Funding: mean versus median. A mean well above the median means a few large
  // amounts pull it up, so the median is the better guide to a typical company.
  if (funding) {
    const who = funding.count < rows.length ? `the ${funding.count} companies with a funding figure` : `the ${funding.count} companies`
    const skewed = funding.mean > funding.median * 1.1
    const figures = { 'companies covered': who, 'median raised': formatGBP(funding.median), 'average raised': formatGBP(funding.mean) }
    angles.funding = skewed
      ? `Half of ${who} have raised ${formatGBP(funding.median)} or less. ` +
        `The average is higher, at ${formatGBP(funding.mean)}, because a small number of large amounts pull it up.`
      : `The average of ${formatGBP(funding.mean)} is close to the median of ${formatGBP(funding.median)}, ` +
        `so a few very large amounts are not skewing the figures for ${who}.`
    notes.funding = {
      point: skewed
        ? 'a few large amounts pull the average well above the median, so the median is the better guide to a typical company'
        : 'the average is close to the median, so no small group of very large amounts skews the figures',
      figures
    }
  }

  // Regions: does the leading region raise more than everywhere else?
  if (regions && funding) {
    const inside = funded.filter(r => r.region === regions.leader.label).map(r => r.amount)
    const outside = funded.filter(r => r.region && r.region !== regions.leader.label).map(r => r.amount)
    if (inside.length >= 5 && outside.length >= 5) {
      const a = median(inside), b = median(outside)
      const place = regions.leader.label
      const same = compare(a, b)
      angles.regions = same
        ? `Being in ${place} makes little difference to funding: the median company there has raised ${formatGBP(a)}, against ${formatGBP(b)} elsewhere.`
        : `The median company in ${place} has raised ${formatGBP(a)}, ${a > b ? 'more than' : 'less than'} the ${formatGBP(b)} raised by the median company elsewhere.`
      notes.regions = {
        point: same
          ? `companies in ${place} raise about the same as companies elsewhere`
          : `the typical company in ${place} has raised ${a > b ? 'more' : 'less'} than the typical company elsewhere`,
        figures: { [`median company in ${place} has raised`]: formatGBP(a), 'median company elsewhere has raised': formatGBP(b) }
      }
    }
  }

  // Sectors: which common sector has the best-funded typical company?
  if (tags && funding) {
    const bySector = tags.top
      .map(t => {
        const amounts = funded.filter(r => r.tags.includes(t.label)).map(r => r.amount)
        return { label: t.label, n: amounts.length, median: amounts.length ? median(amounts) : 0 }
      })
      .filter(s => s.n >= 5)
      .sort((a, b) => b.median - a.median)
    const best = bySector[0]
    if (best && bySector.length >= 2 && best.median > funding.median && !compare(best.median, funding.median)) {
      const sector = best.label.toLowerCase()
      angles.sectors = `Of the most common sectors, ${sector} has the best-funded typical company: ` +
        `a median of ${formatGBP(best.median)} across ${best.n} companies, against ${formatGBP(funding.median)} for the ranking as a whole.`
      notes.sectors = {
        point: `of the common sectors, ${sector} companies are the best funded, judged by their median`,
        figures: { [`median ${sector} company has raised`]: formatGBP(best.median), [`${sector} companies with a funding figure`]: String(best.n), 'median company in the whole ranking has raised': formatGBP(funding.median) }
      }
    }
  }

  // Sizes: how small are most companies? Add up bands from the smallest until
  // they cover at least half, then name the boundary: "fewer than 25 people".
  if (sizes && sizes.length >= 2) {
    const sized = sizes.reduce((s, x) => s + x.count, 0)
    let running = 0
    for (let i = 0; i < sizes.length - 1; i++) {
      running += sizes[i]!.count
      if (running / sized >= 0.5) {
        const limit = bandStart(sizes[i + 1]!.label)
        if (limit > 0) {
          const of = `${running} of the ${sized}${sized < rows.length ? ' with a known size' : ''}`
          // "Small" only when the cut-off really is small; 100+ staff is not.
          const small = limit <= 50
          angles.sizes = small
            ? `Most companies in the ranking are small: ${of} (${formatPct(running / sized)}) employ fewer than ${limit} people.`
            : `Most companies in the ranking, ${of} (${formatPct(running / sized)}), employ fewer than ${limit} people.`
          notes.sizes = {
            point: small ? 'most companies in the ranking are small' : `most companies in the ranking employ fewer than ${limit} people`,
            figures: { [`companies employing fewer than ${limit} people`]: of, share: formatPct(running / sized) }
          }
        }
        break
      }
    }
  }

  // Profile: the most common answer in each section, for the conclusion.
  const parts: string[] = []
  const profileFigures: Record<string, string> = {}
  if (regions) { parts.push(`is based in ${regions.leader.label}`); profileFigures['most common region'] = regions.leader.label }
  if (sizes) {
    const size = [...sizes].sort((a, b) => b.count - a.count)[0]!.label
    parts.push(`employs ${size} people`); profileFigures['most common size'] = `${size} employees`
  }
  if (funding) { parts.push(`has raised around ${formatGBP(funding.median)}`); profileFigures['median raised'] = formatGBP(funding.median) }
  if (parts.length >= 2) {
    angles.profile = `The most common profile in the ranking is a company that ${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}.`
    notes.profile = { point: 'what the most common company in the ranking looks like', figures: profileFigures }
  }

  return { angles, notes }
}

/**
 * At most two headline findings, written as finished sentences so every figure
 * in them comes from code. They give the article its angle; the template puts
 * them in the intro, and Gemini gets the matching notes. Each is skipped when
 * the data can't support it.
 */
function keyFindings(
  total: number,
  funding: DatasetStats['funding'],
  fundedCount: number,
  regions: DatasetStats['regions']
): { findings: string[]; notes: StoryNote[] } {
  const findings: string[] = []
  const notes: StoryNote[] = []

  // Funding concentration. Needs more than ten funded companies, otherwise
  // "the top ten" is everyone and the share is meaningless.
  if (funding && fundedCount > 10 && funding.median > 0) {
    const multiple = (funding.top.amount / funding.median).toFixed(1).replace(/\.0$/, '')
    findings.push(
      `The ten best-funded companies hold ${formatPct(funding.top10Share)} of all funding in the ranking, ` +
      `and ${funding.top.name} has raised ${multiple} times the median of ${formatGBP(funding.median)}.`
    )
    notes.push({
      point: 'funding is concentrated at the top of the ranking',
      figures: { 'share of all funding held by the ten best-funded': formatPct(funding.top10Share), 'best-funded company': funding.top.name, [`${funding.top.name} has raised this many times the median`]: multiple, 'median raised': formatGBP(funding.median) }
    })
  }

  // Regional dominance: the share is of companies with a known location.
  if (regions) {
    const located = regions.counts.reduce((s, r) => s + r.count, 0)
    const of = `${regions.leader.count} of the ${located}${located < total ? ' with a known location' : ''}`
    findings.push(`${regions.leader.label} is home to ${regions.leader.count} of the ${located} companies` +
      `${located < total ? ' with a known location' : ''} (${formatPct(regions.leaderShare)}).`)
    notes.push({
      point: `more companies are based in ${regions.leader.label} than anywhere else`,
      figures: { [`companies based in ${regions.leader.label}`]: of, share: formatPct(regions.leaderShare) }
    })
  }

  return { findings, notes }
}

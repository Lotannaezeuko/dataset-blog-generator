// Every number on the page is computed here, in code.
// The LLM is only given these results to write about, so it can't invent figures.
// Each section is null when the dataset has no column for it.

import type { CompanyRow, CountItem, DatasetStats } from '#shared/types/blog'

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

  return { count: n, amountLabel, funding, regions, tags, sizes, stages, years }
}

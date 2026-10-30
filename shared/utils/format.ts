// Nuxt auto-imports everything in shared/utils into both the app and the server.

/** 622301270 -> "£622.3m", 950000 -> "£950k", 1.2e9 -> "£1.2bn" */
export function formatGBP(n: number): string {
  if (n >= 1e9) return `£${trim(n / 1e9)}bn`
  if (n >= 1e6) return `£${trim(n / 1e6)}m`
  if (n >= 1e3) return `£${Math.round(n / 1e3)}k`
  return `£${Math.round(n)}`
}

/** Full figure for the table, e.g. "£30,314,247" */
export function formatGBPFull(n: number): string {
  return `£${Math.round(n).toLocaleString('en-GB')}`
}

/** 0.784 -> "78%" */
export function formatPct(share: number): string {
  return `${Math.round(share * 100)}%`
}

const trim = (n: number) => (n >= 100 ? n.toFixed(0) : n.toFixed(1)).replace(/\.0$/, '')

/** "Healthtech", "UK", 100 -> "top-100-uk-healthtech" */
export function makeSlug(industry: string, geography: string, count: number): string {
  return `top ${count} ${geography} ${industry}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// Makes sure the fintech blog (part 1 of the brief) exists on a fresh deploy.
// It's built through the same pipeline as uploads, with template copy.
// Re-upload the fintech CSV through /upload to replace it with AI-written copy.

import Papa from 'papaparse'
import { buildBlog } from '../lib/pipeline'

export default defineNitroPlugin(async () => {
  try {
    const csv = await useStorage('assets:server').getItem<string>('seed/fintech.csv')
    if (!csv) return
    const parsed = Papa.parse<Record<string, string>>(String(csv), { header: true, skipEmptyLines: true })
    const blog = await buildBlog({
      headers: parsed.meta.fields ?? [],
      rows: parsed.data,
      industry: 'Fintech',
      geography: 'UK',
      sourceFile: 'fintech_companies_seed.csv'
    })
    if (await getBlog(blog.slug)) return
    await saveBlog(blog)
    console.info(`[seed] created /blog/${blog.slug}`)
  } catch (err) {
    console.warn('[seed] skipped:', (err as Error).message)
  }
})

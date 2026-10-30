// POST /api/blogs  — the upload endpoint.
// The browser parses the CSV with Papa Parse and sends the rows as JSON.

import { buildBlog } from '../../lib/pipeline'

interface Body {
  industry: string
  geography?: string
  filename?: string
  headers: string[]
  rows: Record<string, string>[]
}

export default defineEventHandler(async event => {
  const config = useRuntimeConfig(event)

  // Optional passcode so a public deploy can't be spammed with uploads
  if (config.uploadPasscode && getHeader(event, 'x-upload-passcode') !== config.uploadPasscode) {
    throw createError({ statusCode: 401, statusMessage: 'Wrong upload passcode' })
  }

  const body = await readBody<Body>(event)
  if (!body?.industry?.trim()) throw createError({ statusCode: 400, statusMessage: 'Industry is required' })
  if (!Array.isArray(body.rows) || body.rows.length === 0) throw createError({ statusCode: 400, statusMessage: 'CSV has no rows' })
  if (body.rows.length > 2000) throw createError({ statusCode: 413, statusMessage: 'Max 2000 rows' })

  try {
    const blog = await buildBlog({
      headers: body.headers,
      rows: body.rows,
      industry: body.industry.trim(),
      geography: body.geography?.trim() || 'UK',
      sourceFile: body.filename ?? 'upload.csv',
      gemini: config.geminiApiKey ? { apiKey: config.geminiApiKey, model: config.geminiModel } : undefined
    })
    await saveBlog(blog)
    return { slug: blog.slug, copySource: blog.copySource, mapping: blog.mapping }
  } catch (err) {
    throw createError({ statusCode: 422, statusMessage: (err as Error).message })
  }
})

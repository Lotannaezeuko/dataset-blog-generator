// /sitemap.xml  — built from storage, so new blogs appear without a rebuild.
export default defineEventHandler(async event => {
  const site = useRuntimeConfig(event).public.siteUrl.replace(/\/$/, '')
  const blogs = await listBlogs()
  const urls = [
    `<url><loc>${site}/blog</loc></url>`,
    ...blogs.map(b => `<url><loc>${site}/blog/${b.slug}</loc><lastmod>${b.createdAt.slice(0, 10)}</lastmod></url>`)
  ]
  setHeader(event, 'content-type', 'application/xml')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`
})

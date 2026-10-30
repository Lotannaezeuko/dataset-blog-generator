// /robots.txt  — lets crawlers in, keeps the upload tool out, points to the sitemap.
export default defineEventHandler(event => {
  const site = useRuntimeConfig(event).public.siteUrl.replace(/\/$/, '')
  setHeader(event, 'content-type', 'text/plain')
  return `User-agent: *\nAllow: /\nDisallow: /upload\nDisallow: /api/\n\nSitemap: ${site}/sitemap.xml\n`
})

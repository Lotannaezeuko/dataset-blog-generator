// GET /api/blogs/:slug  — one full blog record, used by pages/blog/[slug].vue
export default defineEventHandler(async event => {
  const slug = getRouterParam(event, 'slug')!
  const blog = await getBlog(slug)
  if (!blog) throw createError({ statusCode: 404, statusMessage: 'Blog not found' })
  return blog
})

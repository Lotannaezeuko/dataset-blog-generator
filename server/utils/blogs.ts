// Small wrapper around Nitro storage. Auto-imported in all server files.

import type { BlogRecord, BlogSummary } from '#shared/types/blog'

const store = () => useStorage<BlogRecord>('blogs')

export const getBlog = (slug: string) => store().getItem(slug)

export const saveBlog = (blog: BlogRecord) => store().setItem(blog.slug, blog)

export async function listBlogs(): Promise<BlogSummary[]> {
  const keys = await store().getKeys()
  const blogs = await Promise.all(keys.map(k => store().getItem(k)))
  return blogs
    .filter((b): b is BlogRecord => !!b)
    .map(b => ({
      slug: b.slug,
      industry: b.industry,
      geography: b.geography,
      createdAt: b.createdAt,
      copySource: b.copySource,
      title: b.copy.h1,
      description: b.copy.metaDescription,
      count: b.stats.count
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

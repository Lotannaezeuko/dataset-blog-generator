// In production (Vercel) the filesystem is read-only, so blogs live in Upstash Redis.
// Adding Upstash through the Vercel marketplace sets KV_REST_API_URL and KV_REST_API_TOKEN.
// Locally, nuxt.config.ts devStorage keeps them as JSON files in .data/blogs instead.

import upstashDriver from 'unstorage/drivers/upstash'

export default defineNitroPlugin(() => {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (import.meta.dev || !url || !token) return

  const storage = useStorage()
  storage.unmount('blogs')
  storage.mount('blogs', upstashDriver({ url, token, base: 'blogs' }))
})

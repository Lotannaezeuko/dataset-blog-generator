<script setup lang="ts">
// The one blog template. Every dataset renders through this page.
// useFetch runs on the server during SSR, so the full HTML (copy + table)
// is in the response that Google receives. That's the "server-rendered" requirement.
import type { BlogRecord } from '#shared/types/blog'

const route = useRoute()
const slug = route.params.slug as string
const { data: blog, error } = await useFetch<BlogRecord>(`/api/blogs/${slug}`)

if (error.value || !blog.value) {
  throw createError({ statusCode: 404, statusMessage: 'Blog not found', fatal: true })
}

const b = blog.value
const s = b.stats
const site = useRuntimeConfig().public.siteUrl.replace(/\/$/, '')
const url = `${site}/blog/${b.slug}`

// ---- Head tags ----
useSeoMeta({
  title: b.copy.seoTitle,
  description: b.copy.metaDescription,
  ogTitle: b.copy.seoTitle,
  ogDescription: b.copy.metaDescription,
  ogType: 'article',
  ogUrl: url,
  twitterCard: 'summary_large_image'
})

// ---- Structured data (JSON-LD) ----
// Article: tells Google what the page is. ItemList: the ranking itself.
// FAQPage: the FAQ section, can show as rich results. It's only included when there
// are questions — an FAQPage with an empty mainEntity is invalid structured data, and
// a dataset with only a name column produces no FAQ.
const jsonLd: Record<string, unknown>[] = [
  {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: b.copy.h1,
    description: b.copy.metaDescription,
    datePublished: b.createdAt,
    mainEntityOfPage: url
  },
  {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: b.copy.h1,
    numberOfItems: b.rows.length,
    itemListElement: b.rows.map(r => ({
      '@type': 'ListItem',
      position: r.rank,
      item: { '@type': 'Organization', name: r.name, ...(r.website && { url: r.website }) }
    }))
  }
]

if (b.copy.faq.length) {
  jsonLd.push({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: b.copy.faq.map(f => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer }
    }))
  })
}

useHead({
  link: [{ rel: 'canonical', href: url }],
  script: [{ type: 'application/ld+json', innerHTML: JSON.stringify(jsonLd) }]
})

// Headline numbers for the stat cards. Only stats that exist for this dataset.
const cards = computed(() => [
  { label: 'Companies ranked', value: String(s.count) },
  s.funding && { label: 'Total raised', value: formatGBP(s.funding.total) },
  s.funding && { label: 'Median raised', value: formatGBP(s.funding.median) },
  s.funding && { label: 'Top 10 share of funding', value: formatPct(s.funding.top10Share) },
  s.regions && { label: `Based in ${s.regions.leader.label}`, value: formatPct(s.regions.leaderShare) },
  s.tags && { label: 'Sectors covered', value: String(s.tags.distinct) }
].filter(Boolean) as { label: string; value: string }[])
</script>

<template>
  <main class="wrap article">
    <nav class="crumbs" aria-label="Breadcrumb">
      <NuxtLink to="/blog">Rankings</NuxtLink> / <span>{{ b.industry }}</span>
    </nav>

    <article>
      <header>
        <h1>{{ b.copy.h1 }}</h1>
        <p class="meta">
          Updated <time :datetime="b.createdAt">{{ new Date(b.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) }}</time>
          · {{ s.count }} companies
        </p>
        <p class="lede">{{ b.copy.intro }}</p>
      </header>

      <!-- With only the row count there's nothing worth a card row: the figure is
           already in the meta line above and in the ranking heading below. -->
      <StatCards v-if="cards.length > 1" :cards="cards" />

      <section id="ranking">
        <h2>The full ranking</h2>
        <RankingTable :rows="b.rows" :amount-label="s.amountLabel" />
      </section>

      <section v-if="s.funding" id="funding">
        <h2>How funding is distributed</h2>
        <p>{{ b.copy.fundingInsight }}</p>
        <BarList :items="s.funding.bands" unit="companies" />
      </section>

      <section v-if="s.regions" id="regions">
        <h2>Where {{ b.industry }} companies are based</h2>
        <p>{{ b.copy.regionInsight }}</p>
        <BarList :items="s.regions.counts" unit="companies" />
      </section>

      <section v-if="s.tags" id="sectors">
        <h2>The most common sectors</h2>
        <p>{{ b.copy.sectorInsight }}</p>
        <BarList :items="s.tags.top" unit="companies" />
      </section>

      <section v-if="s.sizes" id="size">
        <h2>Company size</h2>
        <p>{{ b.copy.sizeInsight }}</p>
        <BarList :items="s.sizes" unit="companies" :sort="false" />
      </section>

      <section v-if="b.copy.faq.length" id="faq">
        <h2>Frequently asked questions</h2>
        <details v-for="f in b.copy.faq" :key="f.question" open>
          <summary><h3>{{ f.question }}</h3></summary>
          <p>{{ f.answer }}</p>
        </details>
      </section>

      <section id="summary">
        <h2>Summary</h2>
        <p>{{ b.copy.conclusion }}</p>
      </section>

      <footer class="source">
        Source: {{ b.sourceFile }}. Copy written by {{ b.copySource === 'gemini' ? 'Gemini from computed statistics' : 'template' }}.
      </footer>
    </article>
  </main>
</template>

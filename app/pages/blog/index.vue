<script setup lang="ts">
import type { BlogSummary } from '#shared/types/blog'

const { data: blogs } = await useFetch<BlogSummary[]>('/api/blogs')
const site = useRuntimeConfig().public.siteUrl

useSeoMeta({
  title: 'Industry rankings and insights',
  description: 'Rankings of the top UK companies by industry, with funding statistics, regional breakdowns and sector insights.'
})
useHead({ link: [{ rel: 'canonical', href: `${site}/blog` }] })
</script>

<template>
  <main class="wrap">
    <h1>Industry rankings</h1>
    <p class="lede">Each page is generated from a company dataset.</p>
    <ul class="blog-list">
      <li v-for="b in blogs" :key="b.slug">
        <NuxtLink :to="`/blog/${b.slug}`">
          <h2>{{ b.title }}</h2>
          <p>{{ b.description }}</p>
          <span class="tag">{{ b.count }} companies</span>
          <span class="tag">{{ b.copySource === 'gemini' ? 'AI copy' : 'Template copy' }}</span>
        </NuxtLink>
      </li>
    </ul>
    <p v-if="!blogs?.length">No blogs yet. <NuxtLink to="/upload">Generate one</NuxtLink>.</p>
  </main>
</template>

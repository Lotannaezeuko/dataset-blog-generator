<script setup lang="ts">
// Upload a CSV -> parse it in the browser -> POST rows to /api/blogs -> show what was
// detected, then link to the new page.
import Papa from 'papaparse'
import type { ColumnMapping, ColumnRole } from '#shared/types/blog'

useSeoMeta({ title: 'Generate a blog from a dataset', robots: 'noindex' })

const industry = ref('')
const geography = ref('UK')
const passcode = ref('')
const file = ref<File | null>(null)
const preview = ref<{ headers: string[]; count: number } | null>(null)
const status = ref<'idle' | 'working' | 'error' | 'done'>('idle')
const message = ref('')
const result = ref<{ slug: string; copySource: 'gemini' | 'template'; mapping: ColumnMapping } | null>(null)
const resultPanel = ref<HTMLElement | null>(null)
let parsed: Papa.ParseResult<Record<string, string>> | null = null

// Every role the pipeline can fill, so the panel can also show what wasn't found.
const ROLES: { role: ColumnRole; label: string }[] = [
  { role: 'name', label: 'Company name' },
  { role: 'amount', label: 'Amount / funding' },
  { role: 'rank', label: 'Rank' },
  { role: 'region', label: 'Region' },
  { role: 'tags', label: 'Sectors / tags' },
  { role: 'stage', label: 'Stage' },
  { role: 'size', label: 'Employees' },
  { role: 'year', label: 'Founded' },
  { role: 'description', label: 'Description' },
  { role: 'website', label: 'Website' }
]

function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  file.value = f
  // Guess the industry from the file name: "healthtech_companies.csv" -> "Healthtech"
  if (!industry.value) {
    const guess = f.name.replace(/\.csv$/i, '').split(/[_\-\s]/)[0] ?? ''
    industry.value = guess.charAt(0).toUpperCase() + guess.slice(1)
  }
  Papa.parse<Record<string, string>>(f, {
    header: true,
    skipEmptyLines: true,
    complete: res => {
      parsed = res
      preview.value = { headers: res.meta.fields ?? [], count: res.data.length }
    }
  })
}

async function generate() {
  if (!parsed) return
  status.value = 'working'
  result.value = null
  message.value = 'Detecting columns, computing statistics and writing copy…'
  try {
    const res = await $fetch<NonNullable<typeof result.value>>('/api/blogs', {
      method: 'POST',
      headers: passcode.value ? { 'x-upload-passcode': passcode.value } : {},
      body: {
        industry: industry.value,
        geography: geography.value,
        filename: file.value?.name,
        headers: parsed.meta.fields ?? [],
        rows: parsed.data
      }
    })
    result.value = res
    status.value = 'done'
    message.value = ''
    // The panel renders below the form, so without this the viewport doesn't move
    // and it looks like nothing happened. Focus follows the scroll so keyboard and
    // screen-reader users land on the result too.
    await nextTick()
    resultPanel.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    resultPanel.value?.focus()
  } catch (err: any) {
    status.value = 'error'
    message.value = err?.data?.statusMessage ?? err?.message ?? 'Something went wrong'
  }
}
</script>

<template>
  <main class="wrap narrow">
    <h1>Generate a blog from a dataset</h1>
    <p class="lede">Upload a CSV of companies. The page is created from the same template as every other ranking.</p>

    <form class="upload" @submit.prevent="generate">
      <label>CSV file
        <input type="file" accept=".csv,text/csv" required @change="onFile">
      </label>

      <p v-if="preview" class="hint">
        {{ preview.count }} rows. Columns: {{ preview.headers.join(', ') }}
      </p>

      <label>Industry name
        <input v-model="industry" required placeholder="e.g. Healthtech">
      </label>
      <label>Geography
        <input v-model="geography" placeholder="UK">
      </label>
      <label>Passcode <small>(only if one is set on the server)</small>
        <input v-model="passcode" type="password" autocomplete="off">
      </label>

      <button type="submit" :disabled="!preview || status === 'working'">
        {{ status === 'working' ? 'Generating…' : 'Generate blog' }}
      </button>
      <p v-if="message" :class="['status', status]" role="status">{{ message }}</p>
    </form>

    <!-- What the pipeline made of the file: which header filled which role, and
         which roles it couldn't fill (those sections are left off the page). -->
    <section v-if="result" ref="resultPanel" class="result" role="status" tabindex="-1">
      <h2>Page generated</h2>
      <p class="hint">
        Copy written by {{ result.copySource === 'gemini' ? 'Gemini' : 'the built-in template (Gemini unavailable)' }}.
      </p>

      <h3>Detected columns</h3>
      <dl class="mapping">
        <template v-for="r in ROLES" :key="r.role">
          <dt>{{ r.label }}</dt>
          <dd v-if="result.mapping[r.role]"><code>{{ result.mapping[r.role] }}</code></dd>
          <dd v-else class="missing">not in this CSV</dd>
        </template>
      </dl>

      <NuxtLink class="view" :to="`/blog/${result.slug}`">View the blog page →</NuxtLink>
    </section>
  </main>
</template>

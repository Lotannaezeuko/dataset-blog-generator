<script setup lang="ts">
// The full ranking. All rows are in the server HTML (good for SEO);
// the search box just filters them in the browser afterwards.
import type { CompanyRow } from '#shared/types/blog'

const props = defineProps<{ rows: CompanyRow[]; amountLabel: string | null }>()

// Only show columns this dataset actually has
const has = computed(() => ({
  amount: props.rows.some(r => r.amount !== null),
  region: props.rows.some(r => r.region),
  stage: new Set(props.rows.map(r => r.stage).filter(Boolean)).size > 1, // hide if every row is the same
  size: props.rows.some(r => r.size),
  tags: props.rows.some(r => r.tags.length)
}))

const query = ref('')
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.rows
  return props.rows.filter(r =>
    [r.name, r.region, r.description, ...r.tags].some(v => v?.toLowerCase().includes(q))
  )
})
</script>

<template>
  <div>
    <label class="search">
      <span class="sr-only">Filter companies</span>
      <input v-model="query" type="search" placeholder="Filter by name, region or sector">
    </label>
    <div class="table-scroll">
      <table class="ranking">
        <caption class="sr-only">Ranking of {{ rows.length }} companies</caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Company</th>
            <th v-if="has.amount" scope="col" class="num">{{ amountLabel ?? 'Amount' }}</th>
            <th v-if="has.region" scope="col">Region</th>
            <th v-if="has.stage" scope="col">Stage</th>
            <th v-if="has.size" scope="col">Employees</th>
            <th v-if="has.tags" scope="col">Sectors</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in filtered" :key="r.rank + r.name">
            <td class="rank">{{ r.rank }}</td>
            <th scope="row" class="company">
              <a v-if="r.website" :href="r.website" rel="nofollow noopener" target="_blank">{{ r.name }}</a>
              <span v-else>{{ r.name }}</span>
              <small v-if="r.description">{{ r.description }}</small>
            </th>
            <td v-if="has.amount" class="num">{{ r.amount !== null ? formatGBPFull(r.amount) : '–' }}</td>
            <td v-if="has.region">{{ r.region ?? '–' }}</td>
            <td v-if="has.stage">{{ r.stage ?? '–' }}</td>
            <td v-if="has.size">{{ r.size ?? '–' }}</td>
            <td v-if="has.tags" class="tags">{{ r.tags.slice(0, 3).join(', ') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

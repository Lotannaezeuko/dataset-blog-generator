<script setup lang="ts">
// Horizontal bars in plain HTML/CSS. No chart library, so it renders on the
// server and the numbers are readable text for crawlers and screen readers.
import type { CountItem } from '#shared/types/blog'

const props = withDefaults(defineProps<{ items: CountItem[]; unit?: string; sort?: boolean; limit?: number }>(), {
  unit: '',
  sort: true,
  limit: 10
})

const shown = computed(() => {
  const list = props.sort ? [...props.items].sort((a, b) => b.count - a.count) : props.items
  return list.slice(0, props.limit)
})
const max = computed(() => Math.max(...shown.value.map(i => i.count), 1))
</script>

<template>
  <ul class="bars">
    <li v-for="i in shown" :key="i.label">
      <span class="bar-label">{{ i.label }}</span>
      <span class="bar-track"><span class="bar-fill" :style="{ width: `${(i.count / max) * 100}%` }" /></span>
      <span class="bar-value">{{ i.count }}<span class="sr-only"> {{ unit }}</span></span>
    </li>
  </ul>
</template>

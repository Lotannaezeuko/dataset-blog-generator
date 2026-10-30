<script setup lang="ts">
defineProps<{ cards: { label: string; value: string }[] }>()
</script>

<template>
  <dl class="stat-cards">
    <div v-for="c in cards" :key="c.label" class="stat">
      <dt>{{ c.label }}</dt>
      <dd>{{ c.value }}</dd>
    </div>
  </dl>
</template>

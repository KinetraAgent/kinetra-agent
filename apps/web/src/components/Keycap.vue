<script setup lang="ts">
defineProps<{ label: string; pressed?: boolean; tone?: "accent" | "neg"; as?: "button" | "span" }>();
</script>

<template>
  <component :is="as ?? 'button'" :type="as === 'span' ? undefined : 'button'" class="keycap mono" :class="[tone, { pressed }]">
    <slot>{{ label }}</slot>
  </component>
</template>

<style scoped>
.keycap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 32px;
  height: 32px;
  padding: 0 10px;
  border-radius: var(--r-key);
  border: 1px solid var(--line-2);
  border-bottom-width: 3px;
  border-bottom-color: var(--key-edge);
  background: var(--key);
  color: var(--text);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.08);
  transition:
    transform 90ms var(--ease),
    border-bottom-width 90ms var(--ease),
    background-color var(--fast) var(--ease),
    color var(--fast) var(--ease);
}
.keycap:hover {
  background: var(--raised);
}
.keycap:active,
.keycap.pressed {
  transform: translateY(2px);
  border-bottom-width: 1px;
}
.keycap.accent {
  background: var(--accent);
  color: var(--accent-ink);
  border-color: transparent;
  border-bottom-color: color-mix(in srgb, var(--accent) 45%, black);
}
.keycap.neg:hover {
  color: var(--neg);
}
</style>

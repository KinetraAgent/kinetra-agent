<script setup lang="ts">
import { Check, Copy } from "lucide-vue-next";
import { useCopy } from "../lib/copy";

defineProps<{ command: string }>();
const { copied, copy } = useCopy();
</script>

<template>
  <button type="button" class="cmd mono" :class="{ copied }" :aria-label="`Copy: ${command}`" @click="copy(command)">
    <span class="prompt">$</span>
    <span class="text">{{ command }}</span>
    <span class="key">
      <Check v-if="copied" :size="14" :stroke-width="1.5" />
      <Copy v-else :size="14" :stroke-width="1.5" />
      {{ copied ? "copied" : "copy" }}
    </span>
  </button>
</template>

<style scoped>
.cmd {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 48px;
  padding: 6px 6px 6px 16px;
  border-radius: var(--r-ctl);
  border: 1px solid var(--line-2);
  background: var(--card);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: border-color var(--fast) var(--ease);
}
.cmd:hover {
  border-color: var(--accent);
}
.prompt {
  color: var(--accent);
}
.text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
}
.key {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  border-radius: var(--r-key);
  border: 1px solid var(--line-2);
  border-bottom: 3px solid var(--key-edge);
  background: var(--key);
  color: var(--text-2);
  font-size: 12px;
  transition:
    transform 90ms var(--ease),
    border-bottom-width 90ms var(--ease),
    color var(--fast) var(--ease);
}
.cmd:active .key,
.copied .key {
  transform: translateY(2px);
  border-bottom-width: 1px;
}
.copied .key {
  color: var(--pos);
}
</style>

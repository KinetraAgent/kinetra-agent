<script setup lang="ts">
defineProps<{ value: string }>();
const DIGITS = "0123456789";
</script>

<template>
  <!-- each digit is a strip of 0-9 that slides to its value, keyed from the right so places stay put as it grows -->
  <span class="roll" :aria-label="value">
    <template v-for="(c, i) in value" :key="value.length - i">
      <span v-if="DIGITS.includes(c)" class="d" aria-hidden="true">
        <span class="strip" :style="{ transform: `translateY(${-Number(c) * 10}%)` }">
          <span v-for="n in DIGITS" :key="n">{{ n }}</span>
        </span>
      </span>
      <span v-else aria-hidden="true">{{ c }}</span>
    </template>
  </span>
</template>

<style scoped>
.roll {
  display: inline-flex;
  font-variant-numeric: tabular-nums;
}
.d {
  display: inline-block;
  height: 1.2em;
  line-height: 1.2em;
  overflow: hidden;
  vertical-align: bottom;
}
.strip {
  display: flex;
  flex-direction: column;
  transition: transform 900ms cubic-bezier(0.16, 1, 0.3, 1);
}
</style>

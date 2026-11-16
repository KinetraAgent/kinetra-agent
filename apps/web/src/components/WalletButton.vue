<script setup lang="ts">
import { LogOut, Wallet } from "lucide-vue-next";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { short } from "../lib/chain";
import { connect, disconnect, discoverWallets, wallet, type InjectedWallet } from "../lib/wallet";

const open = ref(false);
const root = ref<HTMLElement>();

onMounted(() => {
  discoverWallets();
  addEventListener("pointerdown", outside);
});
onBeforeUnmount(() => removeEventListener("pointerdown", outside));
const outside = (e: PointerEvent) => {
  if (!root.value?.contains(e.target as Node)) open.value = false;
};

async function pick(w?: InjectedWallet) {
  open.value = false;
  await connect(w);
}
function click() {
  if (wallet.account || wallet.wallets.length > 1) open.value = !open.value;
  else pick();
}
</script>

<template>
  <div ref="root" class="wb">
    <button type="button" class="chip mono" :class="{ on: wallet.account }" :aria-expanded="open" @click="click">
      <span v-if="wallet.account" class="dot"></span>
      <Wallet v-else :size="15" :stroke-width="1.75" />
      {{ wallet.account ? short(wallet.account, 6, 4) : wallet.busy === "connect" ? "Connecting…" : "Connect" }}
    </button>
    <div v-if="open" class="menu card" role="menu">
      <template v-if="wallet.account">
        <button type="button" role="menuitem" @click="disconnect(), (open = false)"><LogOut :size="15" :stroke-width="1.5" /> Disconnect</button>
      </template>
      <template v-else>
        <button v-for="w in wallet.wallets" :key="w.id" type="button" role="menuitem" @click="pick(w)">
          <img v-if="w.icon" :src="w.icon" width="18" height="18" alt="" />
          <Wallet v-else :size="16" :stroke-width="1.5" />
          {{ w.name }}
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.wb {
  position: relative;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 13px;
  cursor: pointer;
  transition:
    background-color var(--fast) var(--ease),
    transform var(--fast) var(--ease);
}
.chip:hover {
  background: color-mix(in srgb, var(--accent) 20%, transparent);
}
.chip:active {
  transform: scale(0.97);
}
.chip.on {
  border-color: var(--line-2);
  background: var(--raised);
  color: var(--text);
}
.dot {
  box-shadow: 0 0 10px var(--pos);
}
.menu {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  z-index: 60;
  min-width: 200px;
  padding: 6px;
  display: grid;
  gap: 2px;
  animation: drop var(--mid) var(--ease);
}
.menu button {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}
.menu button:hover {
  background: var(--raised);
}
.menu img {
  border-radius: 4px;
}
@keyframes drop {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}
</style>

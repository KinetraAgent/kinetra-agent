import { ref } from "vue";

/** Copies text and flips `copied` for a moment. */
export function useCopy() {
  const copied = ref(false);
  let timer = 0;
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = Object.assign(document.createElement("textarea"), { value: text });
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    copied.value = true;
    clearTimeout(timer);
    timer = window.setTimeout(() => (copied.value = false), 1600);
  }
  return { copied, copy };
}

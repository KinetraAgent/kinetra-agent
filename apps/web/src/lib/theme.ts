import { ref } from "vue";

type Theme = "dark" | "light";
export const theme = ref<Theme>(document.documentElement.dataset.theme === "light" ? "light" : "dark");

export function toggleTheme() {
  theme.value = theme.value === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = theme.value;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.value === "dark" ? "#07080d" : "#f5f7fa");
  try {
    localStorage.setItem("kinetra-theme", theme.value);
  } catch {}
}

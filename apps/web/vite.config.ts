import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig, type Plugin } from "vite";

// Testnet builds live on testnet.kinetraagent.tech, mainnet on the apex. Exposed to the app and to
// index.html as VITE_SITE; Vite picks up VITE_ variables from process.env after this file runs.
const NETWORK = process.env.VITE_NETWORK ?? "robinhoodTestnet";
process.env.VITE_SITE ??= NETWORK === "robinhood" ? "https://kinetraagent.tech" : "https://testnet.kinetraagent.tech";

/** Ships networks/<network>/ (install.sh and tool manifests written by the seed script) at the site root. */
function networkFiles(): Plugin {
  const dir = fileURLToPath(new URL(`networks/${NETWORK}`, import.meta.url));
  return {
    name: "kinetra-network-files",
    apply: "build",
    generateBundle() {
      for (const rel of readdirSync(dir, { recursive: true }) as string[]) {
        const file = path.join(dir, rel);
        if (statSync(file).isFile()) this.emitFile({ type: "asset", fileName: rel.split(path.sep).join("/"), source: readFileSync(file) });
      }
    },
  };
}

// Production serves the same paths through nginx (deploy/nginx.conf), which also
// sidesteps ISPs that block the chain hosts by DNS.
export default defineConfig({
  plugins: [vue(), networkFiles()],
  server: {
    proxy: {
      "/rpc": { target: "https://rpc.testnet.chain.robinhood.com", changeOrigin: true, rewrite: () => "/" },
      "/explorer-api": {
        target: "https://explorer.testnet.chain.robinhood.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/explorer-api/, "/api"),
      },
    },
  },
  build: { target: "es2022", chunkSizeWarningLimit: 900 },
});

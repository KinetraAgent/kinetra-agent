import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

// Testnet builds live on testnet.kinetraagent.tech, mainnet on the apex. Exposed to the app and to
// index.html as VITE_SITE; Vite picks up VITE_ variables from process.env after this file runs.
process.env.VITE_SITE ??= process.env.VITE_NETWORK === "robinhood" ? "https://kinetraagent.tech" : "https://testnet.kinetraagent.tech";

// Production serves the same paths through nginx (deploy/nginx.conf), which also
// sidesteps ISPs that block the chain hosts by DNS.
export default defineConfig({
  plugins: [vue()],
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

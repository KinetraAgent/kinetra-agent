import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

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

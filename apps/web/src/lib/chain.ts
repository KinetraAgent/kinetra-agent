import { shallowReactive } from "vue";
import { createPublicClient, defineChain, fallback, http, parseAbi, type Hex } from "viem";

interface Deployment {
  network: string;
  chainId: number;
  contracts: Record<string, { proxy: Hex; implementation: Hex; block: number; verified?: boolean }>;
  // snapshot written by scripts/seed.ts, shown until the live read lands
  release?: { version: string; checksum: Hex; uri: string; publishedAt: number };
  tools?: { name: string; manifestURI: string; manifestHash: Hex; verified: boolean }[];
}

const NETWORK = import.meta.env.VITE_NETWORK ?? "robinhoodTestnet";
const files = import.meta.glob<Deployment>("../../../../packages/contracts/deployments/*.json", {
  eager: true,
  import: "default",
});
const found = Object.entries(files).find(([path]) => path.endsWith(`/${NETWORK}.json`))?.[1];
if (!found) throw new Error(`packages/contracts/deployments/${NETWORK}.json is missing; deploy the contracts first`);
export const deployment = found;

export const TESTNET = deployment.chainId === 46630;
export const EXPLORER = TESTNET ? "https://explorer.testnet.chain.robinhood.com" : "https://robinhoodchain.blockscout.com";
const PUBLIC_RPC = TESTNET ? "https://rpc.testnet.chain.robinhood.com" : "https://rpc.mainnet.chain.robinhood.com";
export const CHAIN_NAME = TESTNET ? "Robinhood Chain Testnet" : "Robinhood Chain";

const chain = defineChain({
  id: deployment.chainId,
  name: CHAIN_NAME,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [PUBLIC_RPC] } },
});

// same-origin proxy first: some ISPs block the chain hosts by DNS
const client = createPublicClient({ chain, transport: fallback([http("/rpc"), http(PUBLIC_RPC)]) });

const releaseAbi = parseAbi([
  "function latest() view returns (string version, bytes32 checksum, string uri, uint64 publishedAt)",
  "function releaseCount() view returns (uint256)",
]);
const toolAbi = parseAbi([
  "struct Tool { address author; string name; string manifestURI; bytes32 manifestHash; bool verified; uint64 registeredAt; }",
  "function toolCount() view returns (uint256)",
  "function tools(uint256 offset, uint256 limit) view returns (Tool[])",
]);

export const CONTRACTS = [
  {
    name: "KinetraReleaseRegistry",
    role: "Notarizes every CLI build. The installer refuses a package whose sha256 differs from the one stored here",
    ...deployment.contracts.KinetraReleaseRegistry,
  },
  {
    name: "KinetraToolRegistry",
    role: "Public index of agent tools with their manifest hashes. Reviewed tools carry a verified flag",
    ...deployment.contracts.KinetraToolRegistry,
  },
];

export interface Tool {
  name: string;
  manifestURI: string;
  manifestHash: Hex;
  verified: boolean;
}

export const live = shallowReactive({
  block: null as bigint | null,
  release: deployment.release ?? null,
  releaseCount: null as number | null,
  tools: (deployment.tools ?? []).map((t) => ({ ...t, verified: true })) as Tool[],
  txDays: [] as { date: string; count: number }[],
});

const releaseAt = CONTRACTS[0].proxy;
const toolsAt = CONTRACTS[1].proxy;

async function readRegistries() {
  const [latest, count, tools] = await Promise.all([
    client.readContract({ address: releaseAt, abi: releaseAbi, functionName: "latest" }),
    client.readContract({ address: releaseAt, abi: releaseAbi, functionName: "releaseCount" }),
    client.readContract({ address: toolsAt, abi: toolAbi, functionName: "tools", args: [0n, 64n] }),
  ]);
  const [version, checksum, uri, publishedAt] = latest;
  live.release = { version, checksum, uri, publishedAt: Number(publishedAt) };
  live.releaseCount = Number(count);
  if (tools.length) live.tools = tools.map(({ name, manifestURI, manifestHash, verified }) => ({ name, manifestURI, manifestHash, verified }));
}

async function readTxChart() {
  const path = "/v2/stats/charts/transactions";
  const res = await fetch(`/explorer-api${path}`).catch(() => null);
  const ok = res?.ok ? res : await fetch(`${EXPLORER}/api${path}`);
  const { chart_data } = (await ok.json()) as { chart_data: { date: string; transactions_count: number }[] };
  live.txDays = chart_data
    .map((d) => ({ date: d.date, count: d.transactions_count }))
    .filter((d) => d.count > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);
}

let started = false;
/** Starts live reads once; the block height ticks while the tab is visible. */
export function startLive() {
  if (started) return;
  started = true;
  readRegistries().catch(() => {});
  readTxChart().catch(() => {});
  const tick = () => {
    if (document.visibilityState === "visible") {
      client
        .getBlockNumber({ cacheTime: 0 })
        .then((b) => (live.block = b))
        .catch(() => {});
    }
  };
  tick();
  setInterval(tick, 2500);
}

export const short = (hex: string, head = 6, tail = 4) => `${hex.slice(0, head)}…${hex.slice(-tail)}`;
export const fmt = (n: number | bigint) => new Intl.NumberFormat("en-US").format(n);

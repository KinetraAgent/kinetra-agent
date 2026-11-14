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
/** CLI version notarized on this network, as the seed script recorded it. */
export const VERSION = deployment.release?.version ?? "1.0.0";

const chain = defineChain({
  id: deployment.chainId,
  name: CHAIN_NAME,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [PUBLIC_RPC] } },
});

// same-origin proxy first: some ISPs block the chain hosts by DNS
// batched: the block chart reads 30 blocks at once and /rpc is rate limited per visitor
const client = createPublicClient({ chain, transport: fallback([http("/rpc", { batch: true }), http(PUBLIC_RPC, { batch: true })]) });

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
  tx: { mode: "days" as "days" | "blocks", points: [] as TxPoint[] },
});

/** One chart point: `label` on the axis, `title` in the tooltip. */
export interface TxPoint {
  key: string;
  label: string;
  title: string;
  count: number;
}

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

const utcDay = (d: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", ...opts });

async function readDailyTx(): Promise<TxPoint[]> {
  const path = "/v2/stats/charts/transactions";
  const res = await fetch(`/explorer-api${path}`).catch(() => null);
  const ok = res?.ok ? res : await fetch(`${EXPLORER}/api${path}`);
  const { chart_data } = (await ok.json()) as { chart_data: { date: string; transactions_count: number }[] };
  return chart_data
    .filter((d) => d.transactions_count > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30)
    .map((d) => ({
      key: d.date,
      label: utcDay(d.date, { month: "short", day: "numeric" }),
      title: utcDay(d.date, { weekday: "short", month: "short", day: "numeric" }),
      count: d.transactions_count,
    }));
}

/** Transactions in 30 blocks spread over the last hour (Robinhood Chain makes about 9 blocks a second). */
async function readBlockTx(samples = 30, every = 1000n): Promise<TxPoint[]> {
  const head = await client.getBlockNumber({ cacheTime: 0 });
  const blocks = await Promise.all(
    Array.from({ length: samples }, (_, i) => client.getBlock({ blockNumber: head - BigInt(samples - 1 - i) * every })),
  );
  const time = (t: bigint) => new Date(Number(t) * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  return blocks
    .map((b) => ({ key: String(b.number), label: time(b.timestamp), title: `block #${fmt(b.number)} · ${time(b.timestamp)}`, count: b.transactions.length }))
    .filter((p) => p.count > 0);
}

// The mainnet explorer API sits behind a bot challenge that also stops the site's proxy, so fall back to
// reading blocks straight from the chain rather than leave the chart empty.
async function readTxChart() {
  const days = await readDailyTx().catch(() => []);
  live.tx = days.length > 1 ? { mode: "days", points: days } : { mode: "blocks", points: await readBlockTx() };
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

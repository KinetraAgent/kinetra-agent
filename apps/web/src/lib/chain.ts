import { shallowReactive } from "vue";
import { createPublicClient, defineChain, fallback, formatEther, http, parseAbi, type Hex } from "viem";

interface Deployment {
  network: string;
  chainId: number;
  contracts: Record<string, { proxy?: Hex; beacon?: Hex; implementation: Hex; block: number; verified?: boolean }>;
  // snapshot written by scripts/seed.ts, shown until the live read lands
  release?: { version: string; checksum: Hex; uri: string; publishedAt: number };
  tools?: { name: string; manifestURI: string; manifestHash: Hex; verified: boolean }[];
  nexus?: NexusSnapshot;
}

/** Nexus market state; scripts/seed.ts writes a snapshot, the live read replaces it. */
export interface NexusSnapshot {
  stats: { agents: number; services: number; jobs: number; completed: number; wallets: number; volumeEth: string };
  services: NexusService[];
  lastJob: { id: number; serviceId: number; amount: string; asset: string; rating: number; createdAt: number; deliveredAt: number; status: string } | null;
}
export interface NexusService {
  id: number;
  title: string;
  details: string;
  provider: string;
  rating: number | null;
  price: string;
  asset: string;
  active: boolean;
  jobs: number;
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

const ROLES: Record<string, string> = {
  KinetraReleaseRegistry: "Notarizes every CLI build. The installer refuses a package whose sha256 differs from the one stored here",
  KinetraToolRegistry: "Public index of agent tools with their manifest hashes. Reviewed tools carry a verified flag",
  KinetraAgentRegistry: "Onchain agent identity: unique names, payout address, jobs completed and ratings from settled work",
  KinetraServiceMarket: "Agents list services, clients hire them. ETH or $KNTR sits in escrow until the delivery is accepted",
  KinetraAgentWallet: "Smart wallet for an agent. Per-payment and daily limits, expiring keys, an allowlist of contracts",
  KinetraWalletFactory: "Deploys agent wallets at deterministic addresses, every setting baked into the address",
};

export const CONTRACTS = Object.entries(deployment.contracts)
  .filter(([name]) => ROLES[name])
  .map(([name, c]) => ({
    name,
    role: ROLES[name],
    address: (c.proxy ?? c.beacon)!,
    pattern: c.beacon ? "Beacon · BeaconProxy" : "UUPS · ERC-1967",
    ...c,
  }));
const at = (name: string) => CONTRACTS.find((c) => c.name === name)?.address;

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
  nexus: deployment.nexus ?? null,
});

const assetName = (a: string) => (/^0x0{40}$/i.test(a) ? "ETH" : KNTR && a.toLowerCase() === KNTR.toLowerCase() ? "KNTR" : "token");

async function readNexus() {
  if (!agentsAt || !marketAt || !factoryAt) return;
  const read = (address: Hex, abi: any, functionName: string, args: unknown[] = []) => client.readContract({ address, abi, functionName, args } as any) as Promise<any>;
  const [agentCount, agents, services, jobs, completed, volumeEth, wallets] = await Promise.all([
    read(agentsAt, agentAbi, "agentCount"),
    read(agentsAt, agentAbi, "agents", [0n, 100n]),
    read(marketAt, marketAbi, "services", [0n, 100n]),
    read(marketAt, marketAbi, "jobCount"),
    read(marketAt, marketAbi, "completedJobs"),
    read(marketAt, marketAbi, "volume", ["0x0000000000000000000000000000000000000000"]),
    read(factoryAt, factoryAbi, "walletCount"),
  ]);
  const byAccount = new Map<string, any>((agents as any[]).map((a) => [a.account.toLowerCase(), a]));
  let lastJob: NexusSnapshot["lastJob"] = null;
  // the newest settled job drives the lifecycle view
  for (let id = Number(jobs) - 1; id >= Math.max(0, Number(jobs) - 20); id--) {
    const j = await read(marketAt, marketAbi, "job", [BigInt(id)]);
    if (j.status !== 3) continue;
    lastJob = { id, serviceId: Number(j.serviceId), amount: formatEther(j.amount), asset: assetName(j.asset), rating: Number(j.rating), createdAt: Number(j.createdAt), deliveredAt: Number(j.deliveredAt), status: JOB_STATUS[j.status] };
    break;
  }
  live.nexus = {
    stats: { agents: Number(agentCount), services: services.length, jobs: Number(jobs), completed: Number(completed), wallets: Number(wallets), volumeEth: formatEther(volumeEth) },
    services: (services as any[]).map((s, id) => {
      const a = byAccount.get(s.provider.toLowerCase());
      return {
        id,
        title: s.title,
        details: s.details,
        provider: a?.name ?? "agent",
        rating: a?.ratingCount ? Math.round((Number(a.ratingSum) / a.ratingCount) * 10) / 10 : null,
        price: formatEther(s.price),
        asset: assetName(s.asset),
        active: s.active,
        jobs: Number(s.jobs),
      };
    }),
    lastJob: lastJob ?? live.nexus?.lastJob ?? null,
  };
}

/** One chart point: `label` on the axis, `title` in the tooltip. */
export interface TxPoint {
  key: string;
  label: string;
  title: string;
  count: number;
}

const releaseAt = at("KinetraReleaseRegistry")!;
const toolsAt = at("KinetraToolRegistry")!;
const agentsAt = at("KinetraAgentRegistry");
const marketAt = at("KinetraServiceMarket");
const factoryAt = at("KinetraWalletFactory");
export const KNTR = (deployment as { kntr?: Hex | null }).kntr ?? null;

const agentAbi = parseAbi([
  "struct Agent { address account; string name; string metadataURI; address payout; uint64 registeredAt; uint32 jobsCompleted; uint32 ratingCount; uint64 ratingSum; }",
  "function agentCount() view returns (uint256)",
  "function agents(uint256 offset, uint256 limit) view returns (Agent[])",
]);
const marketAbi = parseAbi([
  "struct Service { address provider; string title; string details; address asset; uint256 price; bool active; uint64 listedAt; uint32 jobs; }",
  "struct Job { uint256 serviceId; address client; address provider; address asset; uint256 amount; uint8 status; uint8 rating; uint64 createdAt; uint64 deliveredAt; string brief; string result; }",
  "function serviceCount() view returns (uint256)",
  "function services(uint256 offset, uint256 limit) view returns (Service[])",
  "function jobCount() view returns (uint256)",
  "function job(uint256 id) view returns (Job)",
  "function completedJobs() view returns (uint256)",
  "function volume(address asset) view returns (uint256)",
]);
const factoryAbi = parseAbi(["function walletCount() view returns (uint256)"]);
const JOB_STATUS = ["none", "open", "delivered", "completed", "refunded"];

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
  readNexus().catch(() => {});
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

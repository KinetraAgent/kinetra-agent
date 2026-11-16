import { parseAbi, parseEventLogs, type Hex } from "viem";
import { client, factoryAt, live, marketAt, readJobs, short, type NexusJob, type NexusService } from "./chain";
import { send, wallet } from "./wallet";

// Nexus from the browser: hire, accept, refund and deploy agent wallets with the connected wallet.

const marketAbi = parseAbi([
  "error Inactive(uint256 serviceId)",
  "error SelfHire()",
  "error WrongPayment()",
  "error InvalidText()",
  "error InvalidRating()",
  "error NotClient()",
  "error WrongStatus(uint8 status)",
  "error TooEarly()",
  "function hire(uint256 serviceId, string brief) payable returns (uint256)",
  "function accept(uint256 id, uint8 rating)",
  "function cancel(uint256 id)",
  "event JobCreated(uint256 indexed id, uint256 indexed serviceId, address indexed client, address provider, uint256 amount)",
]);
const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);
const factoryAbi = parseAbi([
  "error ZeroOwner()",
  "function createWallet(address owner, address agent, uint64 expiresAt, uint128 ethPerTx, uint128 ethPerDay, bytes32 salt) returns (address)",
  "event WalletCreated(address indexed wallet, address indexed owner, address indexed agent)",
]);

const ETH = "0x0000000000000000000000000000000000000000";

/** Pays the service price into escrow and returns the new job id. Tokens get an exact approval first. */
export async function hire(s: NexusService, brief: string) {
  const price = s.priceWei!;
  const asset = s.assetAddress!;
  if (asset.toLowerCase() !== ETH) {
    const allowed = await client.readContract({ address: asset, abi: erc20Abi, functionName: "allowance", args: [wallet.account!, marketAt!] });
    if (allowed < price) await send("approve", { address: asset, abi: erc20Abi, functionName: "approve", args: [marketAt!, price] });
  }
  const receipt = await send("hire", {
    address: marketAt!,
    abi: marketAbi,
    functionName: "hire",
    args: [BigInt(s.id), brief],
    value: asset.toLowerCase() === ETH ? price : 0n,
  });
  const [log] = parseEventLogs({ abi: marketAbi, eventName: "JobCreated", logs: receipt.logs });
  return Number(log.args.id);
}

export const accept = (id: number, rating: number) => send(`accept-${id}`, { address: marketAt!, abi: marketAbi, functionName: "accept", args: [BigInt(id), rating] });
export const refund = (id: number) => send(`cancel-${id}`, { address: marketAt!, abi: marketAbi, functionName: "cancel", args: [BigInt(id)] });

/** Deploys a KinetraAgentWallet owned by the connected wallet; returns its address. */
export async function createWallet(agent: Hex, perTx: bigint, perDay: bigint, days: number) {
  const expires = BigInt(Math.floor(Date.now() / 1000) + days * 86_400);
  const salt = `0x${Date.now().toString(16).padStart(64, "0")}` as Hex;
  const receipt = await send("wallet", {
    address: factoryAt!,
    abi: factoryAbi,
    functionName: "createWallet",
    args: [wallet.account!, agent, expires, perTx, perDay, salt],
  });
  const [log] = parseEventLogs({ abi: factoryAbi, eventName: "WalletCreated", logs: receipt.logs });
  return log.args.wallet;
}

// shortcut: scans the newest 200 jobs like the CLI does; switch to JobCreated logs indexed by client at thousands of jobs
export async function jobsOf(account: Hex): Promise<NexusJob[]> {
  const jobs = await readJobs(200);
  return jobs.filter((j) => j.client.toLowerCase() === account.toLowerCase());
}

// ── naming, so addresses of agents never reach the page ─────────────────────

/** An agent's name for an address, else the address shortened. */
export function who(address: string) {
  const a = live.nexus?.agents?.find((x) => x.account.toLowerCase() === address.toLowerCase());
  return a ? a.name : short(address, 6, 4);
}

export const service = (id: number) => live.nexus?.services.find((s) => s.id === id);
export const agentNamed = (name: string) => live.nexus?.agents?.find((a) => a.name.toLowerCase() === name.toLowerCase());

export const eth = (v: string) => {
  const n = Number(v);
  return n >= 1 ? (Number.isInteger(n) ? String(n) : n.toFixed(2)) : n >= 0.001 ? n.toFixed(4).replace(/0+$/, "") : String(n);
};

// ── reputation tiers: what a profile badge and its progress bar show ───────

export const TIERS = [
  { name: "Recruit", at: 0 },
  { name: "Operator", at: 1 },
  { name: "Specialist", at: 10 },
  { name: "Veteran", at: 50 },
  { name: "Legend", at: 250 },
] as const;

export function tier(jobs: number) {
  let i = 0;
  while (i + 1 < TIERS.length && jobs >= TIERS[i + 1].at) i++;
  const next = TIERS[i + 1];
  return { name: TIERS[i].name, level: i + 1, next: next?.name, toNext: next ? next.at - jobs : 0, progress: next ? (jobs - TIERS[i].at) / (next.at - TIERS[i].at) : 1 };
}

// ── activity: derived from timestamps the contracts already store ──────────

export interface Activity {
  key: string;
  at: number;
  kind: "join" | "list" | "hire" | "deliver" | "settle";
  text: string;
  meta: string;
  href?: string;
}

export function activity(limit = 12): Activity[] {
  const n = live.nexus;
  if (!n?.agents || !n.jobs) return [];
  const out: Activity[] = [];
  for (const a of n.agents) out.push({ key: `a${a.name}`, at: a.registeredAt, kind: "join", text: `${a.name} registered on Nexus`, meta: "KinetraAgentRegistry", href: `/agent/${encodeURIComponent(a.name)}` });
  for (const s of n.services) {
    if (s.listedAt) out.push({ key: `s${s.id}`, at: s.listedAt, kind: "list", text: `${s.provider} listed ${s.title}`, meta: `${eth(s.price)} ${s.asset}`, href: `/app?service=${s.id}` });
  }
  for (const j of n.jobs) {
    const title = service(j.serviceId)?.title ?? `service #${j.serviceId}`;
    out.push({ key: `h${j.id}`, at: j.createdAt, kind: "hire", text: `${who(j.client)} hired ${who(j.provider)} for ${title}`, meta: `job #${j.id} · ${eth(j.amount)} ${j.asset} in escrow` });
    if (j.deliveredAt) {
      const settled = j.status === "completed";
      out.push({
        key: `d${j.id}`,
        at: j.deliveredAt,
        kind: settled ? "settle" : "deliver",
        text: settled ? `${who(j.provider)} got paid for job #${j.id}` : `${who(j.provider)} delivered job #${j.id}`,
        meta: settled ? (j.rating ? `rated ${"★".repeat(j.rating)}` : "released from escrow") : "waiting for the client",
      });
    }
  }
  return out.sort((a, b) => b.at - a.at).slice(0, limit);
}

const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
/** "3 minutes ago", or "in 5 hours" for a time still ahead. */
export function ago(ts: number, now = Date.now() / 1000) {
  const d = ts - now;
  const s = Math.abs(d);
  // block timestamps can run a few seconds ahead of this clock
  if (s < 60) return "just now";
  const [n, unit]: [number, Intl.RelativeTimeFormatUnit] = s < 3600 ? [60, "minute"] : s < 86_400 ? [3600, "hour"] : [86_400, "day"];
  return rtf.format(Math.round(d / n), unit);
}

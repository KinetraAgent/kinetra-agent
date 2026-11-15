// KINETRA SDK: typed access to KINETRA Nexus on Robinhood Chain, the agent registry, service market and agent
// wallets. The CLI runs on it; developers import it as `@kinetra/cli/sdk`.
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  http,
  parseAbi,
  parseEventLogs,
  zeroAddress,
  type Account,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const ETH: Address = zeroAddress;

export const NEXUS_NETWORKS = {
  robinhood: {
    chainId: 4663,
    name: "Robinhood Chain",
    rpc: "https://rpc.mainnet.chain.robinhood.com",
    explorer: "https://robinhoodchain.blockscout.com",
    agents: "0x6102a6aa951E3b4B5c59616215d1cA85a19Ba5a3" as Address,
    market: "0x6BA8bcd767Cd59760833f816376b91dA544Be358" as Address,
    factory: "0x2dDe78090A4BE36e287bA4b9D171C08Ca2E3daE6" as Address,
    kntr: "0xe7b1db5d4dcd1f9101860dac0a8fc72ac73df84f" as Address | null,
  },
  robinhoodTestnet: {
    chainId: 46630,
    name: "Robinhood Chain Testnet",
    rpc: "https://rpc.testnet.chain.robinhood.com",
    explorer: "https://explorer.testnet.chain.robinhood.com",
    agents: "0xeBC0210814aa12F500adfd478DD33eA32bCe6fc7" as Address,
    market: "0xd3b04846b585675c6290e78Ddf95EDfa4e54B06c" as Address,
    factory: "0xf7F7300f34A6007e267887F960f3A577A0Fb8AEf" as Address,
    kntr: null as Address | null,
  },
};
export type NetworkName = keyof typeof NEXUS_NETWORKS;

/** Testnet builds of the CLI talk to the testnet contracts. */
export const networkOf = (version: string): NetworkName => (version.includes("testnet") ? "robinhoodTestnet" : "robinhood");

export const agentRegistryAbi = parseAbi([
  "struct Agent { address account; string name; string metadataURI; address payout; uint64 registeredAt; uint32 jobsCompleted; uint32 ratingCount; uint64 ratingSum; }",
  "function register(string name, string metadataURI, address payout) returns (uint256)",
  "function update(string metadataURI, address payout)",
  "function isRegistered(address account) view returns (bool)",
  "function agentOf(address account) view returns (Agent)",
  "function agentByName(string name) view returns (Agent)",
  "function agentCount() view returns (uint256)",
  "function agents(uint256 offset, uint256 limit) view returns (Agent[])",
]);

export const marketAbi = parseAbi([
  "struct Service { address provider; string title; string details; address asset; uint256 price; bool active; uint64 listedAt; uint32 jobs; }",
  "struct Job { uint256 serviceId; address client; address provider; address asset; uint256 amount; uint8 status; uint8 rating; uint64 createdAt; uint64 deliveredAt; string brief; string result; }",
  "function listService(string title, string details, address asset, uint256 price) returns (uint256)",
  "function updateService(uint256 id, uint256 price, bool active)",
  "function hire(uint256 serviceId, string brief) payable returns (uint256)",
  "function deliver(uint256 id, string result)",
  "function accept(uint256 id, uint8 rating)",
  "function release(uint256 id)",
  "function cancel(uint256 id)",
  "function decline(uint256 id)",
  "function service(uint256 id) view returns (Service)",
  "function services(uint256 offset, uint256 limit) view returns (Service[])",
  "function serviceCount() view returns (uint256)",
  "function job(uint256 id) view returns (Job)",
  "function jobCount() view returns (uint256)",
  "function completedJobs() view returns (uint256)",
  "function volume(address asset) view returns (uint256)",
  "function deliveryWindow() view returns (uint64)",
  "function reviewWindow() view returns (uint64)",
  "event ServiceListed(uint256 indexed id, address indexed provider, address asset, uint256 price, string title)",
  "event JobCreated(uint256 indexed id, uint256 indexed serviceId, address indexed client, address provider, uint256 amount)",
]);

export const walletAbi = parseAbi([
  "struct Limit { uint128 perTx; uint128 perDay; }",
  "function owner() view returns (address)",
  "function spend(address asset, address to, uint256 amount, bytes data) returns (bytes)",
  "function execute(address target, uint256 value, bytes data) returns (bytes)",
  "function setAgent(address agent, uint64 expiresAt)",
  "function setLimit(address agent, address asset, uint128 perTx, uint128 perDay)",
  "function setTarget(address target, bool allowed)",
  "function agentExpiry(address agent) view returns (uint64)",
  "function limitOf(address agent, address asset) view returns (Limit)",
  "function spentToday(address agent, address asset) view returns (uint256)",
  "function isAgent(address agent) view returns (bool)",
  "function allowedTarget(address target) view returns (bool)",
]);

export const factoryAbi = parseAbi([
  "function createWallet(address owner, address agent, uint64 expiresAt, uint128 ethPerTx, uint128 ethPerDay, bytes32 salt) returns (address)",
  "function predictWallet(address owner, address agent, uint64 expiresAt, uint128 ethPerTx, uint128 ethPerDay, bytes32 salt) view returns (address)",
  "function walletsOf(address owner) view returns (address[])",
  "function walletCount() view returns (uint256)",
  "event WalletCreated(address indexed wallet, address indexed owner, address indexed agent)",
]);

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
]);

export const JOB_STATUS = ["none", "open", "delivered", "completed", "refunded"] as const;
export type JobStatus = (typeof JOB_STATUS)[number];

export interface Agent {
  account: Address;
  name: string;
  metadataURI: string;
  payout: Address;
  registeredAt: bigint;
  jobsCompleted: number;
  ratingCount: number;
  ratingSum: bigint;
}
export interface Service {
  id: number;
  provider: Address;
  title: string;
  details: string;
  asset: Address;
  price: bigint;
  active: boolean;
  listedAt: bigint;
  jobs: number;
}
export interface Job {
  id: number;
  serviceId: number;
  client: Address;
  provider: Address;
  asset: Address;
  amount: bigint;
  status: JobStatus;
  rating: number;
  createdAt: bigint;
  deliveredAt: bigint;
  brief: string;
  result: string;
}

/** Average rating with one decimal, or null before the first rated job. */
export const reputation = (a: Pick<Agent, "ratingCount" | "ratingSum">) =>
  a.ratingCount ? Math.round((Number(a.ratingSum) / a.ratingCount) * 10) / 10 : null;

/** Cuts text to at most `max` UTF-8 bytes without splitting a character. */
export function clipBytes(text: string, max: number): string {
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= max) return text;
  let end = max;
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end--;
  return buf.subarray(0, end).toString("utf8");
}

export interface NexusOptions {
  network?: NetworkName;
  rpc?: string;
  /** signs writes; a private key or a viem account */
  account?: Account | Hex;
  /** KinetraAgentWallet to hire and pay through; the account must be one of its agents */
  wallet?: Address;
  /** other chain settings or contract addresses, e.g. a local node */
  override?: Partial<NexusNetwork>;
}

export type NexusNetwork = (typeof NEXUS_NETWORKS)[NetworkName];

export type Nexus = ReturnType<typeof createNexus>;

export function createNexus(opts: NexusOptions = {}) {
  const net: NexusNetwork = { ...NEXUS_NETWORKS[opts.network ?? "robinhood"], ...opts.override };
  const chain = defineChain({
    id: net.chainId,
    name: net.name,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [net.rpc] } },
  });
  const transport = http(opts.rpc ?? net.rpc, { batch: true, timeout: 30_000 });
  const pub = createPublicClient({ chain, transport });
  const account = typeof opts.account === "string" ? privateKeyToAccount(opts.account) : opts.account;
  const signer = account && createWalletClient({ account, chain, transport });

  async function send(to: Address, data: Hex, value = 0n) {
    if (!signer) throw new Error("this needs a signing key: run kinetra wallet new");
    const hash = await signer.sendTransaction({ to, data, value, chain });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`transaction ${hash} reverted`);
    return receipt;
  }

  /** Client-side market calls go through the smart wallet when there is one, so its limits apply. */
  async function asClient(data: Hex, asset: Address = ETH, amount = 0n) {
    if (opts.wallet) {
      return send(opts.wallet, encodeFunctionData({ abi: walletAbi, functionName: "spend", args: [asset, net.market, amount, data] }));
    }
    if (asset !== ETH && amount > 0n) await send(asset, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [net.market, amount] }));
    return send(net.market, data, asset === ETH ? amount : 0n);
  }

  const readMarket = (functionName: any, args: unknown[] = []) => pub.readContract({ address: net.market, abi: marketAbi, functionName, args } as any) as Promise<any>;
  const readAgents = (functionName: any, args: unknown[] = []) => pub.readContract({ address: net.agents, abi: agentRegistryAbi, functionName, args } as any) as Promise<any>;
  const toService = (s: any, id: number): Service => ({ id, ...s, jobs: Number(s.jobs) });
  const toJob = (j: any, id: number): Job => ({ id, ...j, serviceId: Number(j.serviceId), status: JOB_STATUS[j.status] ?? "none", rating: Number(j.rating) });
  const toAgent = (a: any): Agent => ({ ...a, jobsCompleted: Number(a.jobsCompleted), ratingCount: Number(a.ratingCount) });

  const nexus = {
    network: net,
    public: pub as PublicClient,
    /** the signing key's address, also the agent identity */
    address: account?.address,
    /** who pays and appears as client: the smart wallet if set, else the key */
    client: opts.wallet ?? account?.address,
    assetSymbol: (asset: Address) => (asset === ETH ? "ETH" : asset.toLowerCase() === net.kntr?.toLowerCase() ? "KNTR" : asset),

    async balance(address: Address, asset: Address = ETH): Promise<bigint> {
      if (asset === ETH) return pub.getBalance({ address });
      return pub.readContract({ address: asset, abi: erc20Abi, functionName: "balanceOf", args: [address] });
    },

    agents: {
      count: async () => Number(await readAgents("agentCount")),
      isRegistered: (address: Address): Promise<boolean> => readAgents("isRegistered", [address]),
      get: async (address: Address) => toAgent(await readAgents("agentOf", [address])),
      byName: async (name: string) => toAgent(await readAgents("agentByName", [name])),
      list: async (offset = 0, limit = 100) => ((await readAgents("agents", [BigInt(offset), BigInt(limit)])) as any[]).map(toAgent),
      register: (name: string, metadataURI = "", payout: Address = ETH) =>
        send(net.agents, encodeFunctionData({ abi: agentRegistryAbi, functionName: "register", args: [name, metadataURI, payout] })),
      update: (metadataURI: string, payout: Address = ETH) =>
        send(net.agents, encodeFunctionData({ abi: agentRegistryAbi, functionName: "update", args: [metadataURI, payout] })),
    },

    services: {
      count: async () => Number(await readMarket("serviceCount")),
      get: async (id: number) => toService(await readMarket("service", [BigInt(id)]), id),
      list: async (offset = 0, limit = 100) =>
        ((await readMarket("services", [BigInt(offset), BigInt(limit)])) as any[]).map((s, i) => toService(s, offset + i)),
      async create(s: { title: string; details?: string; asset?: Address; price: bigint }) {
        const receipt = await send(
          net.market,
          encodeFunctionData({ abi: marketAbi, functionName: "listService", args: [s.title, s.details ?? "", s.asset ?? ETH, s.price] }),
        );
        const [log] = parseEventLogs({ abi: marketAbi, eventName: "ServiceListed", logs: receipt.logs });
        return Number(log.args.id);
      },
      update: (id: number, price: bigint, active: boolean) =>
        send(net.market, encodeFunctionData({ abi: marketAbi, functionName: "updateService", args: [BigInt(id), price, active] })),
    },

    jobs: {
      count: async () => Number(await readMarket("jobCount")),
      get: async (id: number) => toJob(await readMarket("job", [BigInt(id)]), id),
      /** Newest first, scanning back over the last `scan` jobs. */
      // shortcut: reads jobs one by one (batched); move to indexed JobCreated logs once the market has thousands of jobs
      async list(filter: { client?: Address; provider?: Address } = {}, scan = 200) {
        const count = await nexus.jobs.count();
        const ids = Array.from({ length: Math.min(scan, count) }, (_, i) => count - 1 - i);
        const jobs = await Promise.all(ids.map((id) => nexus.jobs.get(id)));
        const same = (a: Address, b?: Address) => !b || a.toLowerCase() === b.toLowerCase();
        return jobs.filter((j) => same(j.client, filter.client) && same(j.provider, filter.provider));
      },
      /** Pays the service price into escrow and returns the job id. */
      async hire(serviceId: number, brief: string) {
        const s = await nexus.services.get(serviceId);
        if (!s.active) throw new Error(`service #${serviceId} is not taking jobs`);
        const receipt = await asClient(encodeFunctionData({ abi: marketAbi, functionName: "hire", args: [BigInt(serviceId), brief] }), s.asset, s.price);
        const [log] = parseEventLogs({ abi: marketAbi, eventName: "JobCreated", logs: receipt.logs });
        return Number(log.args.id);
      },
      accept: (id: number, rating: number) => asClient(encodeFunctionData({ abi: marketAbi, functionName: "accept", args: [BigInt(id), rating] })),
      cancel: (id: number) => asClient(encodeFunctionData({ abi: marketAbi, functionName: "cancel", args: [BigInt(id)] })),
      deliver: (id: number, result: string) =>
        send(net.market, encodeFunctionData({ abi: marketAbi, functionName: "deliver", args: [BigInt(id), clipBytes(result, 8192)] })),
      decline: (id: number) => send(net.market, encodeFunctionData({ abi: marketAbi, functionName: "decline", args: [BigInt(id)] })),
      release: (id: number) => send(net.market, encodeFunctionData({ abi: marketAbi, functionName: "release", args: [BigInt(id)] })),
      /** Polls until the provider delivers or the job is refunded; returns the job either way at timeout. */
      async wait(id: number, { timeoutMs = 600_000, pollMs = 5_000, signal }: { timeoutMs?: number; pollMs?: number; signal?: AbortSignal } = {}) {
        const until = Date.now() + timeoutMs;
        while (true) {
          const job = await nexus.jobs.get(id);
          if (job.status !== "open" || Date.now() > until || signal?.aborted) return job;
          await new Promise((r) => setTimeout(r, pollMs));
        }
      },
    },

    wallets: {
      count: async () => Number(await pub.readContract({ address: net.factory, abi: factoryAbi, functionName: "walletCount" })),
      of: (owner: Address) => pub.readContract({ address: net.factory, abi: factoryAbi, functionName: "walletsOf", args: [owner] }),
      /** Creates a KinetraAgentWallet owned by `owner` with `agent` allowed to spend ETH within the limits. */
      async create(w: { owner: Address; agent: Address; expiresAt: bigint; ethPerTx: bigint; ethPerDay: bigint; salt?: Hex }) {
        const salt = w.salt ?? (`0x${Date.now().toString(16).padStart(64, "0")}` as Hex);
        const receipt = await send(
          net.factory,
          encodeFunctionData({ abi: factoryAbi, functionName: "createWallet", args: [w.owner, w.agent, w.expiresAt, w.ethPerTx, w.ethPerDay, salt] }),
        );
        const [log] = parseEventLogs({ abi: factoryAbi, eventName: "WalletCreated", logs: receipt.logs });
        return log.args.wallet;
      },
      async policy(wallet: Address, agent: Address, asset: Address = ETH) {
        const read = (functionName: any, args: unknown[] = []) => pub.readContract({ address: wallet, abi: walletAbi, functionName, args } as any) as Promise<any>;
        const [owner, expiresAt, limit, spentToday] = await Promise.all([
          read("owner"),
          read("agentExpiry", [agent]),
          read("limitOf", [agent, asset]),
          read("spentToday", [agent, asset]),
        ]);
        return { owner: owner as Address, expiresAt: expiresAt as bigint, perTx: limit.perTx as bigint, perDay: limit.perDay as bigint, spentToday: spentToday as bigint };
      },
    },

    async stats() {
      const [agents, services, jobs, completed, volumeEth, wallets] = await Promise.all([
        nexus.agents.count(),
        nexus.services.count(),
        nexus.jobs.count(),
        readMarket("completedJobs").then(Number),
        readMarket("volume", [ETH]) as Promise<bigint>,
        nexus.wallets.count(),
      ]);
      return { agents, services, jobs, completed, volumeEth, wallets };
    },
  };
  return nexus;
}

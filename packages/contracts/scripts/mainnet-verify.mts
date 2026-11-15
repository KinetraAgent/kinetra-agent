// Checks the mainnet contracts end to end and prints a report made to be watched:
// code on chain, ERC-1967 wiring, source verification, live reads, and the hashes the contracts notarize.
// Verification is read from Sourcify (exact match), which the Blockscout explorer also shows: the Blockscout
// API sits behind a Cloudflare challenge that scripts cannot pass.
// usage (repo root): pnpm mainnet:verify
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Interface } from "ethers";

const deployment = JSON.parse(readFileSync(new URL("../deployments/robinhood.json", import.meta.url), "utf8"));
const SITE = "https://kinetraagent.tech";
const EXPLORER = "https://robinhoodchain.blockscout.com";
// same-origin proxies on the site cover visitors whose ISP blocks the chain hosts by DNS
const RPCS = ["https://rpc.mainnet.chain.robinhood.com", `${SITE}/rpc`];
const SOURCIFY = "https://sourcify.dev/server/v2/contract";
const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

const CONTRACTS = [
  { name: "KinetraReleaseRegistry", role: "notarizes every CLI build", ...deployment.contracts.KinetraReleaseRegistry },
  { name: "KinetraToolRegistry", role: "public index of agent tools", ...deployment.contracts.KinetraToolRegistry },
  { name: "KinetraAgentRegistry", role: "onchain agent identity and reputation", ...deployment.contracts.KinetraAgentRegistry },
  { name: "KinetraServiceMarket", role: "agent services and job escrow", ...deployment.contracts.KinetraServiceMarket },
  // a beacon, not a proxy: every agent wallet is a BeaconProxy that reads its implementation from here
  { name: "KinetraAgentWallet", role: "smart wallets with agent spending limits", ...deployment.contracts.KinetraAgentWallet, proxy: deployment.contracts.KinetraAgentWallet.beacon },
  { name: "KinetraWalletFactory", role: "deploys agent wallets", ...deployment.contracts.KinetraWalletFactory },
] as { name: string; role: string; proxy: string; implementation: string; beacon?: string }[];

const releaseAbi = new Interface([
  "function latest() view returns (string version, bytes32 checksum, string uri, uint64 publishedAt)",
  "function releaseCount() view returns (uint256)",
]);
const nexusAbi = new Interface([
  "function agentCount() view returns (uint256)",
  "function market() view returns (address)",
  "function registry() view returns (address)",
  "function serviceCount() view returns (uint256)",
  "function completedJobs() view returns (uint256)",
  "function implementation() view returns (address)",
  "function beacon() view returns (address)",
  "function defaultTarget() view returns (address)",
  "function walletCount() view returns (uint256)",
]);
const toolAbi = new Interface([
  "function tools(uint256 offset, uint256 limit) view returns ((address author, string name, string manifestURI, bytes32 manifestHash, bool verified, uint64 registeredAt)[])",
]);

// ── terminal ────────────────────────────────────────────────────────────────

const tty = !!process.stdout.isTTY && !process.env.CI;
const color = tty && !process.env.NO_COLOR;
const out = (s: string) => process.stdout.write(s);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, tty ? ms : 0));

const paint = (r: number, g: number, b: number) => (s: string) => (color ? `\x1b[38;2;${r};${g};${b}m${s}\x1b[39m` : s);
const c = {
  cyan: paint(34, 225, 245),
  blue: paint(61, 123, 255),
  violet: paint(107, 91, 255),
  green: paint(61, 245, 168),
  red: paint(255, 92, 122),
  yellow: paint(255, 200, 87),
  dim: (s: string) => (color ? `\x1b[2m${s}\x1b[22m` : s),
  bold: (s: string) => (color ? `\x1b[1m${s}\x1b[22m` : s),
};
const link = (url: string) => (tty ? `\x1b]8;;${url}\x07${c.cyan(url)}\x1b]8;;\x07` : url);
const short = (hex: string, head = 6, tail = 4) => `${hex.slice(0, head)}…${hex.slice(-tail)}`;
const fmt = (n: number | bigint) => new Intl.NumberFormat("en-US").format(n);
const explorerUrl = (address: string) => `${EXPLORER}/address/${address}?tab=contract`;

const LOGO = [
  "██╗  ██╗██╗███╗   ██╗███████╗████████╗██████╗  █████╗ ",
  "██║ ██╔╝██║████╗  ██║██╔════╝╚══██╔══╝██╔══██╗██╔══██╗",
  "█████╔╝ ██║██╔██╗ ██║█████╗     ██║   ██████╔╝███████║",
  "██╔═██╗ ██║██║╚██╗██║██╔══╝     ██║   ██╔══██╗██╔══██║",
  "██║  ██╗██║██║ ╚████║███████╗   ██║   ██║  ██║██║  ██║",
  "╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝",
];
const STOPS = [
  [34, 225, 245],
  [61, 123, 255],
  [107, 91, 255],
];

/** Logo gradient, cyan → blue → violet, with an optional white glint centred on column `glow`. */
function shine(line: string, glow = -99) {
  if (!color) return line;
  const chars = [...line];
  return (
    chars
      .map((ch, i) => {
        const x = (i / Math.max(chars.length - 1, 1)) * (STOPS.length - 1);
        const k = Math.min(Math.floor(x), STOPS.length - 2);
        const w = Math.max(0, 1 - Math.abs(i - glow) / 6);
        const rgb = STOPS[k].map((v, j) => v + (STOPS[k + 1][j] - v) * (x - k)).map((v) => Math.round(v + (255 - v) * w));
        return `\x1b[38;2;${rgb.join(";")}m${ch}`;
      })
      .join("") + "\x1b[39m"
  );
}

async function banner() {
  const draw = (glow: number) => LOGO.map((l) => `  ${shine(l, glow)}\n`).join("");
  if (!tty) return out(draw(-99));
  for (const l of LOGO) {
    out(`  ${shine(l)}\n`);
    await sleep(60);
  }
  for (let g = -8; g <= LOGO[0].length + 8; g += 2) {
    out(`\x1b[${LOGO.length}A${draw(g)}`);
    await sleep(14);
  }
  out(`\x1b[${LOGO.length}A${draw(-99)}`);
}

async function type(text: string, style = (s: string) => s, ms = 12) {
  if (!tty) return out(style(text));
  for (const ch of text) {
    out(style(ch));
    await sleep(ms);
  }
}

function key(): Promise<string> {
  return new Promise((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once("data", (d) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      const k = d.toString();
      if (k === "\x03") process.exit(130);
      resolve(k);
    });
  });
}

function open(url: string) {
  const [cmd, ...args] =
    process.platform === "darwin" ? ["open"] : process.platform === "win32" ? ["cmd", "/c", "start", ""] : ["xdg-open"];
  spawn(cmd, [...args, url], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}

// ── checks ──────────────────────────────────────────────────────────────────

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const LABEL = 33;
let passed = 0;
let failed = 0;

/** Runs one check behind a spinner and prints ✓ or ✗ with its detail. */
async function step(label: string, work: () => Promise<string>): Promise<boolean> {
  const started = Date.now();
  let i = 0;
  const frame = () => out(`\r\x1b[2K    ${c.cyan(FRAMES[i++ % FRAMES.length])} ${label}${c.dim(" …")}`);
  const timer = tty ? setInterval(frame, 70) : undefined;
  if (tty) frame();
  let ok = true;
  let detail: string;
  try {
    detail = await work();
  } catch (e) {
    ok = false;
    detail = (e as Error).message;
  }
  const ms = Date.now() - started;
  await sleep(450 - ms); // pacing so each check is readable on a recording
  clearInterval(timer);
  ok ? passed++ : failed++;
  out(`${tty ? "\r\x1b[2K" : ""}    ${ok ? c.green("✓") : c.red("✗")} ${label.padEnd(LABEL)} ${ok ? detail : c.red(detail)}  ${c.dim(`${ms}ms`)}\n`);
  return ok;
}

async function section(n: string, title: string, note: string) {
  out(`\n  ${c.violet(n)}  `);
  await type(title, c.bold);
  out(`  ${c.dim(note)}\n`);
  await sleep(120);
}

async function rpc(method: string, params: unknown[]) {
  let last: unknown;
  for (const url of RPCS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(15000),
      });
      const body = await res.json();
      if (body.error) throw new Error(body.error.message);
      return body.result as string;
    } catch (e) {
      last = e;
    }
  }
  throw new Error(`Robinhood Chain RPC unreachable (${(last as Error).message})`);
}

/** Sourcify v2 record for an address on this chain, with its compilation details. */
async function sourcify(address: string) {
  const res = await fetch(`${SOURCIFY}/${deployment.chainId}/${address}?fields=compilation`, { signal: AbortSignal.timeout(15000) });
  if (res.status === 404) throw new Error("source is not verified");
  if (!res.ok) throw new Error(`Sourcify HTTP ${res.status}`);
  return res.json();
}

const call = async (to: string, abi: Interface, fn: string, args: unknown[] = []) =>
  abi.decodeFunctionResult(fn, await rpc("eth_call", [{ to, data: abi.encodeFunctionData(fn, args) }, "latest"]));

async function download(url: string, timeout = 30000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}
const sha256 = (data: Buffer) => "0x" + createHash("sha256").update(data).digest("hex");

/** Bytecode, proxy wiring and Blockscout verification for one contract. Resolves true when it is verified & published. */
async function checkContract(ct: (typeof CONTRACTS)[number], liveLabel: string, liveRead: () => Promise<string>) {
  await step("contract code at proxy", async () => {
    const [proxy, logic] = await Promise.all([rpc("eth_getCode", [ct.proxy, "latest"]), rpc("eth_getCode", [ct.implementation, "latest"])]);
    if (proxy.length <= 2) throw new Error("no code at the proxy address");
    if (logic.length <= 2) throw new Error("no code at the implementation address");
    return `${fmt(proxy.length / 2 - 1)} B proxy · ${fmt(logic.length / 2 - 1)} B logic`;
  });
  await step(ct.beacon ? "beacon → implementation" : "ERC-1967 slot → implementation", async () => {
    const impl = ct.beacon
      ? String((await call(ct.proxy, nexusAbi, "implementation"))[0])
      : "0x" + (await rpc("eth_getStorageAt", [ct.proxy, IMPL_SLOT, "latest"])).slice(-40);
    if (impl.toLowerCase() !== ct.implementation.toLowerCase()) throw new Error(`slot points to ${impl}, not ${ct.implementation}`);
    return `${short(ct.implementation)} ${c.dim("matches deployment")}`;
  });
  const source = await step("implementation source verified", async () => {
    const sc = await sourcify(ct.implementation);
    if (sc.match !== "exact_match") throw new Error(`only a ${sc.match} on Sourcify`);
    if (sc.compilation?.name !== ct.name) throw new Error(`verified as ${sc.compilation?.name}`);
    return `${ct.name} · solc ${String(sc.compilation.compilerVersion).replace(/^v|\+.*$/g, "")} · ${c.green("exact match")} ${c.dim(`verified ${sc.verifiedAt.slice(0, 10)}`)}`;
  });
  const proxy = await step("proxy source verified", async () => {
    const sc = await sourcify(ct.proxy);
    if (sc.match !== "exact_match") throw new Error(`only a ${sc.match} on Sourcify`);
    return `${sc.compilation?.name ?? "ERC1967Proxy"} ${c.cyan("→")} ${ct.name} · ${c.green("exact match")}`;
  });
  await step(liveLabel, liveRead);

  const verified = source && proxy;
  const row = (k: string, v: string) => out(`    ${c.violet("│")} ${c.dim(k.padEnd(15))} ${v}\n`);
  out(`\n    ${c.violet("┌")} ${c.bold(ct.name)}  ${verified ? c.green("● VERIFIED & PUBLISHED") : c.red("● NOT VERIFIED")}\n`);
  row("role", ct.role);
  row("standard", ct.beacon ? "UpgradeableBeacon · BeaconProxy wallets" : "UUPS · ERC-1967 proxy");
  row("address", c.bold(ct.proxy));
  row("implementation", ct.implementation);
  row("explorer", link(explorerUrl(ct.proxy)));
  out(`    ${c.violet("└")}\n`);
  return verified;
}

// ── run ─────────────────────────────────────────────────────────────────────

async function main() {
  if (tty) {
    out("\x1b[2J\x1b[H\x1b[?25l");
    process.on("exit", () => out("\x1b[?25h"));
  }
  out("\n");
  await banner();
  out("\n  ");
  await type("◢◤ mainnet contract verification", c.cyan);
  out("\n  ");
  await type(`Robinhood Chain · chain ${deployment.chainId} · ${CONTRACTS.length} contracts · Sourcify + Blockscout`, c.dim, 6);
  out("\n\n");

  if (tty && process.stdin.isTTY) {
    out(`  ${c.dim("press")} ${c.cyan("⏎")} ${c.dim("to start")}`);
    await key();
    out("\r\x1b[2K\x1b[1A");
  }
  const started = Date.now();

  await section("01", "NETWORK", "where the contracts live");
  await step("RPC · Robinhood Chain", async () => {
    const id = parseInt(await rpc("eth_chainId", []), 16);
    if (id !== deployment.chainId) throw new Error(`chain ${id}, expected ${deployment.chainId}`);
    return `chain ${id} · block #${fmt(parseInt(await rpc("eth_blockNumber", []), 16))}`;
  });
  await step("Sourcify verification API", async () => {
    const sc = await sourcify(CONTRACTS[0].proxy);
    return `chain ${sc.chainId} indexed · ${c.dim("same sources the explorer shows")}`;
  });

  let release: { version: string; checksum: string; uri: string } | undefined;
  let tools: { name: string; uri: string; hash: string; verified: boolean }[] = [];
  const results: boolean[] = [];

  const [rel, reg] = CONTRACTS;
  await section("02", rel.name, rel.role);
  results.push(
    await checkContract(rel, "live read · latest()", async () => {
      const [version, checksum, uri] = await call(rel.proxy, releaseAbi, "latest");
      const [count] = await call(rel.proxy, releaseAbi, "releaseCount");
      release = { version, checksum, uri };
      return `v${version} · sha256 ${short(checksum, 8, 4)} · ${count} release${count === 1n ? "" : "s"}`;
    }),
  );

  await section("03", reg.name, reg.role);
  results.push(
    await checkContract(reg, "live read · tools(0, 64)", async () => {
      const [list] = await call(reg.proxy, toolAbi, "tools", [0, 64]);
      tools = list.map((t: any) => ({ name: t.name, uri: t.manifestURI, hash: t.manifestHash, verified: t.verified }));
      return `${tools.length} tools · ${tools.filter((t) => t.verified).length} verified`;
    }),
  );

  const nexus = Object.fromEntries(CONTRACTS.slice(2).map((ct) => [ct.name, ct]));
  const n = (k: string, fn: string) => call(nexus[k].proxy, nexusAbi, fn).then((r) => r[0]);
  const same = (a: unknown, b: string, what: string) => {
    if (String(a).toLowerCase() !== b.toLowerCase()) throw new Error(`${what} points to ${a}`);
  };
  const LIVE: Record<string, [string, () => Promise<string>]> = {
    KinetraAgentRegistry: ["live read · agentCount(), market()", async () => {
      same(await n("KinetraAgentRegistry", "market"), nexus.KinetraServiceMarket.proxy, "market");
      return `${await n("KinetraAgentRegistry", "agentCount")} agents · ${c.dim("records jobs from KinetraServiceMarket")}`;
    }],
    KinetraServiceMarket: ["live read · serviceCount(), registry()", async () => {
      same(await n("KinetraServiceMarket", "registry"), nexus.KinetraAgentRegistry.proxy, "registry");
      return `${await n("KinetraServiceMarket", "serviceCount")} services · ${await n("KinetraServiceMarket", "completedJobs")} jobs settled`;
    }],
    KinetraAgentWallet: ["live read · factory.beacon()", async () => {
      same(await n("KinetraWalletFactory", "beacon"), nexus.KinetraAgentWallet.proxy, "factory beacon");
      return `KinetraWalletFactory builds on this beacon`;
    }],
    KinetraWalletFactory: ["live read · walletCount(), defaultTarget()", async () => {
      same(await n("KinetraWalletFactory", "defaultTarget"), nexus.KinetraServiceMarket.proxy, "defaultTarget");
      return `${await n("KinetraWalletFactory", "walletCount")} agent wallets · ${c.dim("market allowed by default")}`;
    }],
  };
  await section("04", "NEXUS", "identity, market, wallets");
  for (const ct of CONTRACTS.slice(2)) {
    out(`\n    ${c.bold(ct.name)}  ${c.dim(ct.role)}\n`);
    results.push(await checkContract(ct, ...LIVE[ct.name]));
  }

  await section("05", "PROOF", "re-hash what the contracts notarize");
  await step("release tarball = onchain sha256", async () => {
    if (!release) throw new Error("latest() was not read");
    const pkg = await download(release.uri, 120000);
    const actual = sha256(pkg);
    if (actual !== release.checksum.toLowerCase()) throw new Error(`mismatch, download hashes to ${short(actual)}`);
    return `${release.uri.split("/").pop()} · ${(pkg.length / 1024).toFixed(1)} KB ${c.dim("matches")}`;
  });
  let matches: boolean[] = [];
  await step("tool manifests = onchain sha256", async () => {
    if (!tools.length) throw new Error("tools() was not read");
    matches = await Promise.all(tools.map((t) => download(t.uri).then((m) => sha256(m) === t.hash.toLowerCase(), () => false)));
    const bad = tools.filter((_, i) => !matches[i]).map((t) => t.name);
    if (bad.length) throw new Error(`${bad.join(", ")} differ from the onchain hash`);
    return `${tools.length}/${tools.length} manifests ${c.dim("match")}`;
  });
  for (let i = 0; i < tools.length; i++) {
    const t = tools[i];
    if (i % 4 === 0) out("      ");
    out(`${matches[i] ? c.green("✓") : c.red("✗")} ${(t.verified ? t.name : `${t.name}*`).padEnd(14)}`);
    if (i % 4 === 3 || i === tools.length - 1) out("\n");
    await sleep(60);
  }

  // summary
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const total = passed + failed;
  const ok = results.filter(Boolean).length;
  const rule = c.dim("━".repeat(66));
  out(`\n  ${rule}\n`);
  out(
    failed
      ? `   ${c.red("✗")} ${c.bold(`${failed} of ${total} checks failed`)}  ${c.dim(`${ok}/${CONTRACTS.length} contracts verified & published`)}\n`
      : `   ${c.green("✓")} ${c.bold(`${ok}/${CONTRACTS.length} contracts verified & published`)} ${c.dim("on Robinhood Chain mainnet")}\n`,
  );
  for (let n = tty ? 0 : passed; n <= passed; n++) {
    out(`\r     ${c.dim(`${n}/${total} checks passed · ${secs}s · chain ${deployment.chainId}`)}`);
    await sleep(40);
  }
  out(`\n  ${rule}\n\n`);
  for (const ct of CONTRACTS) out(`   ${c.bold(ct.name.padEnd(24))} ${c.cyan("↗")} ${link(explorerUrl(ct.proxy))}\n`);
  process.exitCode = failed ? 1 : 0;

  if (!tty || !process.stdin.isTTY) return;
  out(`\n  ${c.dim("open in explorer")}  ${CONTRACTS.map((ct, i) => `${c.cyan(`[${i + 1}]`)} ${ct.name}`).join("  ")}  ${c.cyan("[a]")} all  ${c.cyan("[q]")} quit\n`);
  while (true) {
    const k = (await key()).toLowerCase();
    const picks = k === "a" ? CONTRACTS : CONTRACTS[Number(k) - 1] ? [CONTRACTS[Number(k) - 1]] : null;
    if (!picks) break;
    for (const ct of picks) {
      open(explorerUrl(ct.proxy));
      out(`   ${c.cyan("↗")} opened ${ct.name}\n`);
    }
  }
  out("\n");
}

main().catch((e) => {
  out(`\n  ${c.red("✗")} ${(e as Error).message}\n`);
  process.exitCode = 1;
});

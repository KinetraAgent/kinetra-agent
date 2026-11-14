import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { HOME } from "./store.ts";

/** KinetraToolRegistry per network; a testnet build of the CLI reads the testnet registry. */
export const NETWORKS = {
  robinhood: { registry: "0x969EB253e4D6c243D57971005B94625D63Efc08A", rpc: "https://rpc.mainnet.chain.robinhood.com" },
  robinhoodTestnet: { registry: "0xAFc36c0CFb84404CC50e07425B66c9C2b16bDCB7", rpc: "https://rpc.testnet.chain.robinhood.com" },
};

export const networkFor = (version: string) => NETWORKS[version.includes("testnet") ? "robinhoodTestnet" : "robinhood"];

const sha256 = (data: string | Uint8Array) => "0x" + createHash("sha256").update(data).digest("hex");

export interface RegistryTool {
  author: string;
  name: string;
  manifestURI: string;
  manifestHash: string;
  verified: boolean;
}

/** Calldata for toolOf(string). */
export function encodeToolOf(name: string): string {
  const bytes = Buffer.from(name, "utf8");
  const word = (n: number) => n.toString(16).padStart(64, "0");
  const padded = bytes.toString("hex").padEnd(Math.ceil(bytes.length / 32) * 64, "0");
  return "0x4aceab44" + word(32) + word(bytes.length) + padded;
}

/** Decodes the Tool struct toolOf returns: (address, string, string, bytes32, bool, uint64). */
export function decodeTool(hex: string): RegistryTool {
  const abi = Buffer.from(hex.replace(/^0x/, ""), "hex");
  const base = Number(abi.readBigUInt64BE(24)); // offset of the dynamic tuple
  const word = (i: number) => abi.subarray(base + i * 32, base + i * 32 + 32);
  const str = (i: number) => {
    const at = base + Number(word(i).readBigUInt64BE(24));
    const len = Number(abi.readBigUInt64BE(at + 24));
    return abi.subarray(at + 32, at + 32 + len).toString("utf8");
  };
  return {
    author: "0x" + word(0).subarray(12).toString("hex"),
    name: str(1),
    manifestURI: str(2),
    manifestHash: "0x" + word(3).toString("hex"),
    verified: word(4)[31] === 1,
  };
}

export async function lookupTool(name: string, version: string): Promise<RegistryTool | null> {
  const { registry, rpc } = networkFor(version);
  const res = await fetch(process.env.KINETRA_RPC ?? rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: registry, data: encodeToolOf(name) }, "latest"] }),
    signal: AbortSignal.timeout(20_000),
  });
  const json: any = await res.json();
  if (json.error) {
    if (/revert/i.test(json.error.message ?? "")) return null; // UnknownTool
    throw new Error(`registry read failed: ${json.error.message}`);
  }
  return json.result && json.result !== "0x" ? decodeTool(json.result) : null;
}

async function download(uri: string, what: string): Promise<Buffer> {
  if (!uri.startsWith("https://")) throw new Error(`${what} must be served over https: ${uri}`);
  const res = await fetch(uri, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${what} download failed with HTTP ${res.status}: ${uri}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Installs a community tool into ~/.kinetra/tools: registry entry → manifest (hash checked against the chain)
 * → module (hash checked against the manifest). Unverified entries need allowUnverified.
 */
export async function installTool(name: string, version: string, allowUnverified: boolean, log: (msg: string) => void) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) throw new Error(`invalid tool name ${name}`);
  const entry = await lookupTool(name, version);
  if (!entry) throw new Error(`${name} is not in KinetraToolRegistry`);
  log(`${name} by ${entry.author}, ${entry.verified ? "verified" : "NOT verified"}`);
  if (!entry.verified && !allowUnverified) {
    throw new Error(`${name} has not been reviewed. Read its manifest at ${entry.manifestURI}, then rerun with --unverified to install it anyway`);
  }

  const manifestBytes = await download(entry.manifestURI, "manifest");
  if (sha256(manifestBytes) !== entry.manifestHash) throw new Error(`manifest hash differs from the onchain record, nothing installed`);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (!manifest.module || !manifest.moduleSha256) {
    throw new Error(`${name} is a built-in tool or has no module; nothing to install`);
  }
  const code = await download(manifest.module, "module");
  if (sha256(code) !== String(manifest.moduleSha256).toLowerCase().replace(/^(0x)?/, "0x")) throw new Error(`module hash differs from the manifest, nothing installed`);

  const dir = path.join(HOME, "tools");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${name}.mjs`);
  await writeFile(file, code);
  return file;
}

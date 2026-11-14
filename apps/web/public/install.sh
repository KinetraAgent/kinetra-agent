#!/bin/sh
# KINETRA installer. Downloads the latest CLI package, checks its sha256 against
# KinetraReleaseRegistry on Robinhood Chain and installs it only when they match.
# scripts/seed.ts fills in the registry address and RPC and publishes this file to the site.
set -eu

REGISTRY="0xe2b4fE4EF5d805D3F06F95704c9A3a2f19BA06AF"
RPCS="https://rpc.testnet.chain.robinhood.com https://testnet.kinetraagent.tech/rpc"

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail "KINETRA needs Node.js 22 or newer, get it at https://nodejs.org"
command -v npm >/dev/null 2>&1 || fail "KINETRA needs npm, which ships with Node.js"
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ] || fail "KINETRA needs Node.js 22 or newer, found $(node -v)"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM

KINETRA_REGISTRY="$REGISTRY" KINETRA_RPCS="$RPCS" KINETRA_OUT="$tmp/kinetra-cli.tgz" node --input-type=module -e '
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

const { KINETRA_REGISTRY: to, KINETRA_RPCS: rpcs, KINETRA_OUT: out } = process.env;
const stop = (msg) => { console.error(msg); process.exit(1); };

let hex;
for (const rpc of rpcs.split(" ")) {
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // latest() returns (string version, bytes32 checksum, string uri, uint64 publishedAt)
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data: "0x52bfe789" }, "latest"] }),
      signal: AbortSignal.timeout(15000),
    });
    hex = (await res.json()).result;
    if (hex?.length > 2) break;
  } catch {}
}
if (!(hex?.length > 2)) stop("Could not read KinetraReleaseRegistry on Robinhood Chain. Check your connection and try again");

const abi = Buffer.from(hex.slice(2), "hex");
const word = (i) => abi.subarray(i * 32, i * 32 + 32);
const str = (i) => {
  const at = Number(word(i).readBigUInt64BE(24));
  const len = Number(abi.readBigUInt64BE(at + 24));
  return abi.subarray(at + 32, at + 32 + len).toString("utf8");
};
const version = str(0);
const checksum = word(1).toString("hex");
const uri = str(2);
if (!uri.startsWith("https://github.com/KinetraAgent/")) stop(`Refusing a package from an unexpected host: ${uri}`);

console.log(`› kinetra v${version}, notarized sha256 ${checksum.slice(0, 12)}…`);
const res = await fetch(uri, { signal: AbortSignal.timeout(120000) });
if (!res.ok) stop(`Download failed with HTTP ${res.status}: ${uri}`);
const pkg = Buffer.from(await res.arrayBuffer());
const actual = createHash("sha256").update(pkg).digest("hex");
if (actual !== checksum) stop(`Checksum mismatch, nothing was installed.\n  onchain  ${checksum}\n  download ${actual}`);
writeFileSync(out, pkg);
console.log("✓ sha256 matches the onchain record");
'

npm install -g "$tmp/kinetra-cli.tgz" >/dev/null
printf '%s\n' "✓ kinetra installed. Open a project and run: kinetra"

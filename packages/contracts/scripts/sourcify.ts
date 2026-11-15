import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { artifacts, ethers, network } from "hardhat";

// Verifies implementations, proxies and beacons on Sourcify, which the mainnet Blockscout reads its sources from.
// The Blockscout API itself sits behind a Cloudflare challenge that scripts cannot pass.
const API = "https://sourcify.dev/server/v2";
// proxies and beacons come precompiled with the upgrades plugin; this is the build they were made from
const OZ = JSON.parse(
  readFileSync(path.join(path.dirname(require.resolve("@openzeppelin/upgrades-core/package.json")), "artifacts/build-info-v5.json"), "utf8"),
);
const PROXY = "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy";
const BEACON = "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol:UpgradeableBeacon";

async function isVerified(chainId: number, address: string) {
  const res = await fetch(`${API}/contract/${chainId}/${address}`);
  return res.ok && ["exact_match", "match"].includes((await res.json()).match);
}

/** The upgrades plugin records the creation tx of implementations and proxies; a beacon is found near its block. */
async function creationTx(manifest: Map<string, string>, address: string, block: number) {
  const known = manifest.get(address.toLowerCase());
  if (known) return known;
  for (let b = block + 2; b > block - 30; b--) {
    const blk = await ethers.provider.getBlock(b, false);
    for (const hash of blk?.transactions ?? []) {
      const r = await ethers.provider.getTransactionReceipt(hash);
      if (r?.contractAddress?.toLowerCase() === address.toLowerCase()) return hash;
    }
  }
  return undefined;
}

async function submit(chainId: number, address: string, buildInfo: any, contractIdentifier: string, creationTransactionHash?: string) {
  if (await isVerified(chainId, address)) return "already verified";
  const res = await fetch(`${API}/verify/${chainId}/${address}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ stdJsonInput: buildInfo.input, compilerVersion: buildInfo.solcLongVersion, contractIdentifier, creationTransactionHash }),
  });
  const body: any = await res.json();
  if (!res.ok) {
    if (/already/i.test(JSON.stringify(body))) return "already verified";
    throw new Error(`${contractIdentifier} at ${address}: ${JSON.stringify(body)}`);
  }
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const job: any = await (await fetch(`${API}/verify/${body.verificationId}`)).json();
    if (!job.isJobCompleted) continue;
    if (job.error) throw new Error(`${contractIdentifier} at ${address}: ${job.error.message ?? JSON.stringify(job.error)}`);
    return job.contract?.match ?? "verified";
  }
  throw new Error(`${contractIdentifier} at ${address}: Sourcify did not finish in time`);
}

async function main() {
  const file = `deployments/${network.name}.json`;
  const deployment = JSON.parse(readFileSync(file, "utf8"));
  const { chainId } = deployment;
  const oz = JSON.parse(readFileSync(`.openzeppelin/unknown-${chainId}.json`, "utf8"));
  const manifest = new Map<string, string>(
    [...oz.proxies, ...Object.values<any>(oz.impls)].filter((e) => e.txHash).map((e) => [e.address.toLowerCase(), e.txHash]),
  );
  for (const [name, c] of Object.entries<any>(deployment.contracts)) {
    const id = `contracts/${name}.sol:${name}`;
    const own = await artifacts.getBuildInfo(id);
    if (!own) throw new Error(`no build info for ${id}; run hardhat compile`);
    console.log(`${name} implementation: ${await submit(chainId, c.implementation, own, id, await creationTx(manifest, c.implementation, c.block))}`);
    const holder = c.proxy ?? c.beacon;
    console.log(`${name} ${c.proxy ? "proxy" : "beacon"}: ${await submit(chainId, holder, OZ, c.proxy ? PROXY : BEACON, await creationTx(manifest, holder, c.block))}`);
    c.verified = true;
    writeFileSync(file, JSON.stringify(deployment, null, 2) + "\n");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

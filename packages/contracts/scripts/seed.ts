import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ethers, network } from "hardhat";

// Publishes the CLI tarball checksum and registers the built-in tools.
const REPO = "https://github.com/KinetraAgent/kinetra-agent";
const SITE = network.name === "robinhood" ? "https://kinetraagent.tech" : "https://testnet.kinetraagent.tech";
const cliDir = "../cli";
// install.sh and tool manifests differ per network; the site build ships the matching folder
const webDir = `../../apps/web/networks/${network.name}`;
const webTools = `${webDir}/tools`;

const sha256 = (data: string | Buffer) => "0x" + createHash("sha256").update(data).digest("hex");

async function main() {
  const file = `deployments/${network.name}.json`;
  const deployment = JSON.parse(readFileSync(file, "utf8"));
  const { contracts } = deployment;
  const releases = await ethers.getContractAt("KinetraReleaseRegistry", contracts.KinetraReleaseRegistry.proxy);
  const registry = await ethers.getContractAt("KinetraToolRegistry", contracts.KinetraToolRegistry.proxy);

  const { version } = JSON.parse(readFileSync(`${cliDir}/package.json`, "utf8"));
  const tarball = `kinetra-cli-${version}.tgz`;
  const exists = await releases.releaseOf(version).then(() => true, () => false);
  if (exists) console.log(`release ${version} already notarized`);
  else {
    const checksum = sha256(readFileSync(`${cliDir}/${tarball}`));
    const uri = `${REPO}/releases/download/v${version}/${tarball}`;
    // installers hash what GitHub serves, so notarize only when that matches the local build
    const res = await fetch(uri);
    if (!res.ok) throw new Error(`upload ${tarball} to the v${version} GitHub release first (HTTP ${res.status})`);
    const served = sha256(Buffer.from(await res.arrayBuffer()));
    if (served !== checksum) throw new Error(`GitHub serves ${served}, local ${tarball} is ${checksum}`);
    await (await releases.publish(version, checksum, uri)).wait();
    console.log(`release ${version} notarized ${checksum}`);
  }

  // empty KINETRA_HOME: only built-in tools, never the operator's own ~/.kinetra/tools
  const home = mkdtempSync(path.join(tmpdir(), "kinetra-seed-"));
  const tools = JSON.parse(
    execFileSync("node", [`${cliDir}/dist/cli.js`, "tools", "--json"], { encoding: "utf8", env: { ...process.env, KINETRA_HOME: home } }),
  );
  mkdirSync(webTools, { recursive: true });
  const registered = await registry.tools(0, 100);
  for (const tool of tools) {
    const manifest = JSON.stringify({ ...tool, version }, null, 2) + "\n";
    writeFileSync(`${webTools}/${tool.name}.json`, manifest);
    const uri = `${SITE}/tools/${tool.name}.json`;
    const hash = sha256(manifest);
    let id = registered.findIndex((t: any) => t.name === tool.name);
    if (id < 0) {
      id = Number(await registry.toolCount());
      await (await registry.register(tool.name, uri, hash)).wait();
      console.log(`tool ${tool.name} registered #${id}`);
    } else if (registered[id].manifestURI !== uri || registered[id].manifestHash !== hash) {
      // update() clears the verified flag, set again below
      await (await registry.update(id, uri, hash)).wait();
      console.log(`tool ${tool.name} updated #${id}`);
    }
    if (!(await registry.tool(id)).verified) await (await registry.setVerified(id, true)).wait();
  }

  // snapshot for the site, shown until its live chain read lands
  const [v, checksum, uri, publishedAt] = await releases.latest();
  deployment.release = { version: v, checksum, uri, publishedAt: Number(publishedAt) };
  deployment.tools = (await registry.tools(0, 100)).map((t: any) => ({
    name: t.name,
    manifestURI: t.manifestURI,
    manifestHash: t.manifestHash,
    verified: t.verified,
  }));
  writeFileSync(file, JSON.stringify(deployment, null, 2) + "\n");

  const rpc = (network.config as { url: string }).url;
  const installer = readFileSync(`${cliDir}/install.sh`, "utf8")
    .replace("__REGISTRY__", contracts.KinetraReleaseRegistry.proxy)
    .replace("__RPC__", rpc)
    .replace("__SITE__", SITE);
  writeFileSync(`${webDir}/install.sh`, installer);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { ethers, network } from "hardhat";

// Publishes the CLI tarball checksum and registers the built-in tools.
const REPO = "https://github.com/KinetraAgent/kinetra-agent";
const SITE = "https://kinetraagent.tech";
const cliDir = "../cli";
const webTools = "../../apps/web/public/tools";

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
    await (await releases.publish(version, checksum, `${REPO}/releases/download/v${version}/${tarball}`)).wait();
    console.log(`release ${version} notarized ${checksum}`);
  }

  const tools = JSON.parse(execFileSync("node", [`${cliDir}/dist/cli.js`, "tools", "--json"], { encoding: "utf8" }));
  mkdirSync(webTools, { recursive: true });
  for (const tool of tools) {
    const manifest = JSON.stringify({ ...tool, version }, null, 2) + "\n";
    writeFileSync(`${webTools}/${tool.name}.json`, manifest);
    if (await registry.toolOf(tool.name).then(() => true, () => false)) continue;
    const id = await registry.toolCount();
    await (await registry.register(tool.name, `${SITE}/tools/${tool.name}.json`, sha256(manifest))).wait();
    await (await registry.setVerified(id, true)).wait();
    console.log(`tool ${tool.name} registered #${id}`);
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
    .replace("__RPC__", rpc);
  writeFileSync("../../apps/web/public/install.sh", installer);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

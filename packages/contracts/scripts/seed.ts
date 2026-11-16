import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ethers, network } from "hardhat";
import { nexusSnapshot } from "./snapshot";

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

  await seedNexus(deployment, sha256);
  writeFileSync(file, JSON.stringify(deployment, null, 2) + "\n");

  const rpc = (network.config as { url: string }).url;
  const installer = readFileSync(`${cliDir}/install.sh`, "utf8")
    .replace("__REGISTRY__", contracts.KinetraReleaseRegistry.proxy)
    .replace("__RPC__", rpc)
    .replace("__SITE__", SITE);
  writeFileSync(`${webDir}/install.sh`, installer);
}

/**
 * Gives Nexus its first agent: the KINETRA identity, its agent wallet and three services. A smoke-test job then runs
 * the whole escrow cycle on the live contracts (hire from the wallet, deliver, check the delivery, accept). The
 * services pause afterwards until a `kinetra serve` worker is running for them.
 */
async function seedNexus(deployment: any, sha256: (d: string | Buffer) => string) {
  const { contracts } = deployment;
  if (!contracts.KinetraServiceMarket) return;
  const [me] = await ethers.getSigners();
  const agents = await ethers.getContractAt("KinetraAgentRegistry", contracts.KinetraAgentRegistry.proxy);
  const market = await ethers.getContractAt("KinetraServiceMarket", contracts.KinetraServiceMarket.proxy);
  const factory = await ethers.getContractAt("KinetraWalletFactory", contracts.KinetraWalletFactory.proxy);
  const kntr: string | null = deployment.kntr ?? null;

  const profile = {
    name: "kinetra",
    description: "The official KINETRA agent. Code review, unit tests and release attestations, delivered by kinetra serve.",
    site: SITE,
  };
  mkdirSync(`${webDir}/agents`, { recursive: true });
  writeFileSync(`${webDir}/agents/kinetra.json`, JSON.stringify(profile, null, 2) + "\n");
  if (!(await agents.isRegistered(me.address))) {
    await (await agents.register("kinetra", `${SITE}/agents/kinetra.json`, ethers.ZeroAddress)).wait();
    console.log("agent kinetra registered");
  }

  let [wallet] = await factory.walletsOf(me.address);
  if (!wallet) {
    const expires = Math.floor(Date.now() / 1000) + 365 * 86_400;
    const args = [me.address, me.address, expires, ethers.parseEther("0.001"), ethers.parseEther("0.005"), ethers.id("kinetra")] as const;
    wallet = await factory.predictWallet(...args);
    await (await factory.createWallet(...args)).wait();
    console.log("agent wallet created");
  }
  if ((await ethers.provider.getBalance(wallet)) < ethers.parseEther("0.00002")) {
    await (await me.sendTransaction({ to: wallet, value: ethers.parseEther("0.00005") })).wait();
  }

  const SERVICES = [
    { title: "Release attestation", details: "Checks a KINETRA release: the sha256 notarized in KinetraReleaseRegistry against the package GitHub serves.", asset: ethers.ZeroAddress, price: ethers.parseEther("0.00001") },
    { title: "Code review", details: "Reviews a diff or a public repo for bugs, security holes and missing tests. Send the diff or the URL in the brief.", asset: ethers.ZeroAddress, price: ethers.parseEther("0.002") },
    kntr
      ? { title: "Unit tests", details: "Writes unit tests for the code in the brief, in its own test framework. Paid in $KNTR.", asset: kntr, price: ethers.parseEther("1000") }
      : { title: "Unit tests", details: "Writes unit tests for the code in the brief, in its own test framework.", asset: ethers.ZeroAddress, price: ethers.parseEther("0.003") },
  ];
  const listed = (await market.services(0, 100)).map((s: any, id: number) => ({ id, ...s.toObject() }));
  for (const svc of SERVICES) {
    if (listed.some((l: any) => l.provider === me.address && l.title === svc.title)) continue;
    await (await market.listService(svc.title, svc.details, svc.asset, svc.price)).wait();
    console.log(`service "${svc.title}" listed`);
  }
  const mine = (await market.services(0, 100)).map((s: any, id: number) => ({ id, ...s.toObject() })).filter((s: any) => s.provider === me.address);
  const attest = mine.find((s: any) => s.title === "Release attestation")!;

  const walletC = await ethers.getContractAt("KinetraAgentWallet", wallet);
  const jobs = Number(await market.jobCount());
  let done = false;
  for (let id = 0; id < jobs && !done; id++) done = (await market.job(id)).client === wallet && (await market.job(id)).status === 3n;
  if (!done) {
    if (!attest.active) await (await market.updateService(attest.id, attest.price, true)).wait();
    const hire = market.interface.encodeFunctionData("hire", [attest.id, "Smoke test after deployment: attest the latest KINETRA release."]);
    await (await walletC.spend(ethers.ZeroAddress, await market.getAddress(), attest.price, hire)).wait();
    const id = Number(await market.jobCount()) - 1;
    const releases = await ethers.getContractAt("KinetraReleaseRegistry", contracts.KinetraReleaseRegistry.proxy);
    const [version, checksum, uri] = await releases.latest();
    const res = await fetch(uri);
    const served = sha256(Buffer.from(await res.arrayBuffer()));
    const result = JSON.stringify({ version, notarized: checksum, served, match: served === checksum, registry: contracts.KinetraReleaseRegistry.proxy });
    await (await market.deliver(id, result)).wait();
    if (JSON.parse((await market.job(id)).result).match !== true) throw new Error(`smoke test job #${id}: release ${version} does not match its notarized checksum`);
    const accept = market.interface.encodeFunctionData("accept", [id, 5]);
    await (await walletC.spend(ethers.ZeroAddress, await market.getAddress(), 0, accept)).wait();
    console.log(`smoke test job #${id} settled through the agent wallet`);
  }
  for (const s of (await market.services(0, 100)).map((s: any, id: number) => ({ id, ...s.toObject() })).filter((s: any) => s.provider === me.address && s.active)) {
    await (await market.updateService(s.id, s.price, false)).wait();
  }

  deployment.nexus = await nexusSnapshot(deployment);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ethers, network, upgrades } from "hardhat";

/** $KNTR, accepted by KinetraServiceMarket on mainnet. */
const KNTR: Record<string, string> = { robinhood: "0xe7b1db5d4dcd1f9101860dac0a8fc72ac73df84f" };

type Contracts = Record<string, { proxy?: string; beacon?: string; implementation: string; block: number; verified?: boolean }>;

// in dependency order; initializer arguments may use contracts deployed above them
const STEPS: { name: string; beacon?: boolean; args?: (me: string, c: Contracts) => unknown[] }[] = [
  { name: "KinetraReleaseRegistry" },
  { name: "KinetraToolRegistry" },
  { name: "KinetraAgentRegistry" },
  { name: "KinetraServiceMarket", args: (me, c) => [me, c.KinetraAgentRegistry.proxy] },
  { name: "KinetraAgentWallet", beacon: true },
  { name: "KinetraWalletFactory", args: (me, c) => [me, c.KinetraAgentWallet.beacon, c.KinetraServiceMarket.proxy] },
];

async function main() {
  const file = `deployments/${network.name}.json`;
  const out = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : { network: network.name, chainId: network.config.chainId, contracts: {} };
  const contracts: Contracts = out.contracts;
  const [deployer] = await ethers.getSigners();
  const expected = process.env.DEPLOYER_ADDRESS;
  if (expected && deployer.address.toLowerCase() !== expected.toLowerCase())
    throw new Error(`DEPLOYER_PRIVATE_KEY belongs to ${deployer.address}, not DEPLOYER_ADDRESS ${expected}`);

  for (const { name, beacon, args } of STEPS) {
    if (contracts[name]) {
      console.log(`${name} already at ${contracts[name].proxy ?? contracts[name].beacon}`);
      continue;
    }
    const factory = await ethers.getContractFactory(name);
    if (beacon) {
      // every wallet is a BeaconProxy; upgrading this beacon upgrades them all
      const b = await upgrades.deployBeacon(factory);
      await b.waitForDeployment();
      const address = await b.getAddress();
      // deployBeacon hands back no deployment transaction; the beacon lands in the latest block
      contracts[name] = { beacon: address, implementation: await upgrades.beacon.getImplementationAddress(address), block: await ethers.provider.getBlockNumber() };
    } else {
      const proxy = await upgrades.deployProxy(factory, args?.(deployer.address, contracts) ?? [deployer.address], { kind: "uups" });
      await proxy.waitForDeployment();
      const receipt = await proxy.deploymentTransaction()!.wait();
      const address = await proxy.getAddress();
      contracts[name] = { proxy: address, implementation: await upgrades.erc1967.getImplementationAddress(address), block: receipt!.blockNumber };
    }
    // persist after each contract so a failed run never loses a live address
    writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
    console.log(`${name} ${contracts[name].proxy ?? contracts[name].beacon}`);
  }

  const agents = await ethers.getContractAt("KinetraAgentRegistry", contracts.KinetraAgentRegistry.proxy!);
  if ((await agents.market()) !== contracts.KinetraServiceMarket.proxy) {
    await (await agents.setMarket(contracts.KinetraServiceMarket.proxy!)).wait();
    console.log("KinetraAgentRegistry now takes job records from KinetraServiceMarket");
  }
  const kntr = KNTR[network.name];
  const market = await ethers.getContractAt("KinetraServiceMarket", contracts.KinetraServiceMarket.proxy!);
  if (kntr && !(await market.supportedAsset(kntr))) {
    await (await market.setAsset(kntr, true)).wait();
    console.log(`KinetraServiceMarket accepts $KNTR ${kntr}`);
  }
  out.kntr = kntr ?? null;
  writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

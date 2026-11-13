import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ethers, network, upgrades } from "hardhat";

const NAMES = ["KinetraReleaseRegistry", "KinetraToolRegistry"];

async function main() {
  const file = `deployments/${network.name}.json`;
  const out = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : { network: network.name, chainId: network.config.chainId, contracts: {} };
  const [deployer] = await ethers.getSigners();
  const expected = process.env.DEPLOYER_ADDRESS;
  if (expected && deployer.address.toLowerCase() !== expected.toLowerCase())
    throw new Error(`DEPLOYER_PRIVATE_KEY belongs to ${deployer.address}, not DEPLOYER_ADDRESS ${expected}`);

  for (const name of NAMES) {
    if (out.contracts[name]) {
      console.log(`${name} already at ${out.contracts[name].proxy}`);
      continue;
    }
    const proxy = await upgrades.deployProxy(await ethers.getContractFactory(name), [deployer.address], {
      kind: "uups",
    });
    await proxy.waitForDeployment();
    const receipt = await proxy.deploymentTransaction()!.wait();
    const address = await proxy.getAddress();
    out.contracts[name] = {
      proxy: address,
      implementation: await upgrades.erc1967.getImplementationAddress(address),
      block: receipt!.blockNumber,
    };
    // persist after each contract so a failed run never loses a live address
    writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
    console.log(`${name} proxy ${address}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

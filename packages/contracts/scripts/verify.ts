import { readFileSync, writeFileSync } from "node:fs";
import { network, run } from "hardhat";

// The upgrades plugin's verify task verifies the implementation, the ERC1967 proxy and links them.
async function main() {
  const file = `deployments/${network.name}.json`;
  const deployment = JSON.parse(readFileSync(file, "utf8"));
  const { contracts } = deployment;
  for (const [name, c] of Object.entries<any>(contracts)) {
    try {
      await run("verify", { address: c.proxy ?? c.beacon });
      console.log(`${name} verified`);
    } catch (e: any) {
      if (!/already verified/i.test(e.message)) throw e;
      console.log(`${name} already verified`);
    }
    c.verified = true;
    writeFileSync(file, JSON.stringify(deployment, null, 2) + "\n");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { ethers, network } from "hardhat";
import { nexusSnapshot } from "./snapshot";

/**
 * Puts kinetra-cloud on Nexus: the agent KINETRA Cloud serves jobs as. It signs with its own key, which lives
 * only on the worker and holds gas money; every payout goes to the deployer address. Safe to run again.
 */
const NAME = "kinetra-cloud";
const SITE = network.name === "robinhood" ? "https://kinetraagent.tech" : "https://testnet.kinetraagent.tech";
// read by deploy/cloud/worker.sh, never committed
const ENV = `../../deploy/cloud/${network.name}.env`;
const GAS_FLOOR = ethers.parseEther("0.0003");
const GAS_TOPUP = ethers.parseEther("0.001");

function agentKey(): string {
  if (existsSync(ENV)) {
    const key = readFileSync(ENV, "utf8").match(/^KINETRA_AGENT_KEY=(0x[0-9a-fA-F]{64})$/m)?.[1];
    if (key) return key;
    throw new Error(`${ENV} has no KINETRA_AGENT_KEY line`);
  }
  const key = ethers.Wallet.createRandom().privateKey;
  writeFileSync(
    ENV,
    `KINETRA_AGENT_KEY=${key}\n# model for the worker; free tier: https://aistudio.google.com/apikey\nGEMINI_API_KEY=\nSERVE_ARGS=--provider gemini --model gemini-flash-lite-latest\n`,
    { mode: 0o600 },
  );
  chmodSync(ENV, 0o600);
  console.log(`new agent key written to ${ENV} (mode 600)`);
  return key;
}

async function main() {
  const file = `deployments/${network.name}.json`;
  const deployment = JSON.parse(readFileSync(file, "utf8"));
  const { contracts } = deployment;
  const kntr: string | null = deployment.kntr ?? null;
  const [deployer] = await ethers.getSigners();
  const agent = new ethers.Wallet(agentKey(), ethers.provider);
  const agents = await ethers.getContractAt("KinetraAgentRegistry", contracts.KinetraAgentRegistry.proxy, agent);
  const market = await ethers.getContractAt("KinetraServiceMarket", contracts.KinetraServiceMarket.proxy, agent);

  if ((await ethers.provider.getBalance(agent.address)) < GAS_FLOOR) {
    await (await deployer.sendTransaction({ to: agent.address, value: GAS_TOPUP })).wait();
    console.log(`sent ${ethers.formatEther(GAS_TOPUP)} ETH for gas to ${agent.address}`);
  }

  const profile = {
    name: NAME,
    description: "KINETRA Cloud, around the clock: contract explainers, code reviews and unit tests, delivered onchain by kinetra serve.",
    site: SITE,
  };
  const webAgents = `../../apps/web/networks/${network.name}/agents`;
  mkdirSync(webAgents, { recursive: true });
  writeFileSync(`${webAgents}/${NAME}.json`, JSON.stringify(profile, null, 2) + "\n");
  if (!(await agents.isRegistered(agent.address))) {
    // payout to the deployer: earnings never sit on the worker's key
    await (await agents.register(NAME, `${SITE}/agents/${NAME}.json`, deployer.address)).wait();
    console.log(`agent ${NAME} registered`);
  }

  const SERVICES = [
    {
      title: "Contract explainer",
      details: "Explains a contract on Robinhood Chain in plain English: what it does, who can change it and where the money can move. Send a verified address or paste the source.",
      asset: ethers.ZeroAddress,
      price: ethers.parseEther("0.00005"),
    },
    {
      title: "Code review",
      details: "Reviews a diff or a public repo for bugs, security holes and missing tests. Send the diff or the URL in the brief.",
      asset: ethers.ZeroAddress,
      price: ethers.parseEther("0.002"),
    },
    kntr
      ? { title: "Unit tests", details: "Writes unit tests for the code in the brief, in its own test framework. Paid in $KNTR.", asset: kntr, price: ethers.parseEther("1000") }
      : { title: "Unit tests", details: "Writes unit tests for the code in the brief, in its own test framework.", asset: ethers.ZeroAddress, price: ethers.parseEther("0.003") },
  ];
  const listed = (await market.services(0, 100)).map((s: any, id: number) => ({ id, ...s.toObject() }));
  for (const svc of SERVICES) {
    const mine = listed.find((l: any) => l.provider === agent.address && l.title === svc.title);
    if (!mine) {
      await (await market.listService(svc.title, svc.details, svc.asset, svc.price)).wait();
      console.log(`service "${svc.title}" listed`);
    } else if (!mine.active) {
      await (await market.updateService(mine.id, mine.price, true)).wait();
      console.log(`service "${svc.title}" resumed`);
    }
  }

  deployment.nexus = await nexusSnapshot(deployment);
  writeFileSync(file, JSON.stringify(deployment, null, 2) + "\n");
  console.log(`${NAME} is live as ${agent.address}. Next: add a model key to ${ENV}, then deploy/cloud/worker.sh ${network.name}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

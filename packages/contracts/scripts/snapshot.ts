import { ethers } from "hardhat";

/** Nexus state for the site, in the shape apps/web/src/lib/chain.ts reads live; shown until that read lands. */
export async function nexusSnapshot(deployment: any) {
  const { contracts } = deployment;
  const kntr: string | null = deployment.kntr ?? null;
  const agents = await ethers.getContractAt("KinetraAgentRegistry", contracts.KinetraAgentRegistry.proxy);
  const market = await ethers.getContractAt("KinetraServiceMarket", contracts.KinetraServiceMarket.proxy);
  const factory = await ethers.getContractAt("KinetraWalletFactory", contracts.KinetraWalletFactory.proxy);
  const agentList = await agents.agents(0, 100);
  const byAccount = new Map(agentList.map((a: any) => [a.account, a]));
  const services = (await market.services(0, 100)).map((s: any, id: number) => {
    const a: any = byAccount.get(s.provider);
    return {
      id,
      title: s.title,
      details: s.details,
      provider: a?.name ?? "agent",
      rating: a && a.ratingCount ? Math.round((Number(a.ratingSum) / Number(a.ratingCount)) * 10) / 10 : null,
      price: ethers.formatEther(s.price),
      asset: s.asset === ethers.ZeroAddress ? "ETH" : s.asset.toLowerCase() === kntr?.toLowerCase() ? "KNTR" : "token",
      active: s.active,
      jobs: Number(s.jobs),
    };
  });
  let lastJob = null;
  for (let id = Number(await market.jobCount()) - 1; id >= 0 && !lastJob; id--) {
    const j = await market.job(id);
    if (j.status !== 3n) continue;
    lastJob = {
      id,
      serviceId: Number(j.serviceId),
      amount: ethers.formatEther(j.amount),
      asset: j.asset === ethers.ZeroAddress ? "ETH" : "KNTR",
      rating: Number(j.rating),
      createdAt: Number(j.createdAt),
      deliveredAt: Number(j.deliveredAt),
      status: "completed",
    };
  }
  return {
    stats: {
      agents: Number(await agents.agentCount()),
      services: services.length,
      jobs: Number(await market.jobCount()),
      completed: Number(await market.completedJobs()),
      wallets: Number(await factory.walletCount()),
      volumeEth: ethers.formatEther(await market.volume(ethers.ZeroAddress)),
    },
    services,
    lastJob,
  };
}

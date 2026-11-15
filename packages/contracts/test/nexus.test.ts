import assert from "node:assert/strict";
import { ethers, network, upgrades } from "hardhat";

const ETH = ethers.ZeroAddress;
const eth = (n: string) => ethers.parseEther(n);
const DAY = 86_400;

async function later(seconds: number) {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
}

async function nexus() {
  const [owner, provider, client, agent, stranger] = await ethers.getSigners();
  const registry: any = await upgrades.deployProxy(await ethers.getContractFactory("KinetraAgentRegistry"), [owner.address], { kind: "uups" });
  const market: any = await upgrades.deployProxy(
    await ethers.getContractFactory("KinetraServiceMarket"),
    [owner.address, await registry.getAddress()],
    { kind: "uups" },
  );
  await registry.setMarket(await market.getAddress());
  const beacon = await upgrades.deployBeacon(await ethers.getContractFactory("KinetraAgentWallet"));
  const factory: any = await upgrades.deployProxy(
    await ethers.getContractFactory("KinetraWalletFactory"),
    [owner.address, await beacon.getAddress(), await market.getAddress()],
    { kind: "uups" },
  );
  const token: any = await (await ethers.getContractFactory("TestToken")).deploy();
  return { owner, provider, client, agent, stranger, registry, market, beacon, factory, token };
}

describe("KinetraAgentRegistry", () => {
  it("registers identities with unique, clean names", async () => {
    const { registry, provider, client } = await nexus();
    await registry.connect(provider).register("code-reviewer", "https://a/agent.json", ethers.ZeroAddress);
    const a = await registry.agentOf(provider.address);
    assert.equal(a.name, "code-reviewer");
    assert.equal(a.payout, provider.address);
    assert.equal((await registry.agentByName("code-reviewer")).account, provider.address);
    assert.equal(await registry.agentCount(), 1n);

    await assert.rejects(registry.connect(provider).register("other", "", ethers.ZeroAddress), /AlreadyRegistered/);
    await assert.rejects(registry.connect(client).register("code-reviewer", "", ethers.ZeroAddress), /NameTaken/);
    for (const bad of ["", "Upper", "has space", "x".repeat(33), "emoji✓"]) {
      await assert.rejects(registry.connect(client).register(bad, "", ethers.ZeroAddress), /InvalidName/, bad);
    }
    await registry.connect(provider).update("https://b", client.address);
    assert.equal(await registry.payoutOf(provider.address), client.address);
  });

  it("takes job records from the market only", async () => {
    const { registry, provider } = await nexus();
    await registry.connect(provider).register("a", "", ethers.ZeroAddress);
    await assert.rejects(registry.recordJob(provider.address, 5), /NotMarket/);
  });
});

describe("KinetraServiceMarket", () => {
  async function listed(asset = ETH, price = eth("0.01")) {
    const n = await nexus();
    await n.registry.connect(n.provider).register("builder", "", ethers.ZeroAddress);
    if (asset !== ETH) await n.market.setAsset(asset, true);
    await n.market.connect(n.provider).listService("Write tests", "Adds unit tests to a repo", asset, price);
    return n;
  }

  it("runs a paid job end to end and builds reputation", async () => {
    const { market, registry, provider, client, owner } = await listed();
    await market.setTerms(owner.address, 250, DAY, 3 * DAY);
    await assert.rejects(market.connect(client).hire(0, "tests for src/", { value: eth("0.005") }), /WrongPayment/);
    await assert.rejects(market.connect(provider).hire(0, "self", { value: eth("0.01") }), /SelfHire/);
    await market.connect(client).hire(0, "tests for src/", { value: eth("0.01") });

    let j = await market.job(0);
    assert.equal(j.status, 1n);
    assert.equal(j.brief, "tests for src/");
    await assert.rejects(market.connect(client).deliver(0, "x"), /NotProvider/);
    await assert.rejects(market.connect(client).accept(0, 5), /WrongStatus/);
    await market.connect(provider).deliver(0, "added 12 tests");

    const before = await ethers.provider.getBalance(provider.address);
    const treasuryBefore = await ethers.provider.getBalance(owner.address);
    await assert.rejects(market.connect(client).accept(0, 6), /InvalidRating/);
    await market.connect(client).accept(0, 4);
    assert.equal((await ethers.provider.getBalance(provider.address)) - before, eth("0.00975"));
    assert.equal((await ethers.provider.getBalance(owner.address)) - treasuryBefore, eth("0.00025"));

    j = await market.job(0);
    assert.equal(j.status, 3n);
    assert.equal(j.result, "added 12 tests");
    const a = await registry.agentOf(provider.address);
    assert.equal(a.jobsCompleted, 1n);
    assert.equal(a.ratingSum, 4n);
    assert.equal(await market.volume(ETH), eth("0.01"));
    assert.equal(await market.completedJobs(), 1n);
    assert.equal((await market.service(0)).jobs, 1n);
  });

  it("pays in a supported token such as $KNTR", async () => {
    const { market, token, provider, client } = await listed();
    await assert.rejects(market.connect(provider).listService("t", "", await token.getAddress(), 1), /UnsupportedAsset/);
    await market.setAsset(await token.getAddress(), true);
    await market.connect(provider).listService("Audit", "", await token.getAddress(), eth("100"));
    await token.transfer(client.address, eth("100"));
    await assert.rejects(market.connect(client).hire(1, "audit"), /ERC20InsufficientAllowance/);
    await token.connect(client).approve(await market.getAddress(), eth("100"));
    await market.connect(client).hire(1, "audit");
    await market.connect(provider).deliver(0, "no findings");
    await market.connect(client).accept(0, 5);
    assert.equal(await token.balanceOf(provider.address), eth("100"));
    assert.equal(await market.volume(await token.getAddress()), eth("100"));
  });

  it("refunds undelivered jobs and releases unreviewed ones", async () => {
    const { market, provider, client, stranger } = await listed();
    await market.connect(client).hire(0, "a", { value: eth("0.01") });
    await assert.rejects(market.connect(client).cancel(0), /TooEarly/);
    await later(DAY + 1);
    const before = await ethers.provider.getBalance(client.address);
    const tx = await market.connect(client).cancel(0);
    const r = await tx.wait();
    assert.equal((await ethers.provider.getBalance(client.address)) - before + r.gasUsed * r.gasPrice, eth("0.01"));
    assert.equal((await market.job(0)).status, 4n);

    await market.connect(client).hire(0, "b", { value: eth("0.01") });
    await market.connect(provider).decline(1);
    assert.equal((await market.job(1)).status, 4n);

    await market.connect(client).hire(0, "c", { value: eth("0.01") });
    await market.connect(provider).deliver(2, "done");
    await assert.rejects(market.connect(stranger).release(2), /TooEarly/);
    await later(3 * DAY + 1);
    await market.connect(stranger).release(2);
    assert.equal((await market.job(2)).status, 3n);
    await assert.rejects(market.connect(client).accept(2, 5), /WrongStatus/);
  });

  it("guards listings and terms", async () => {
    const { market, provider, stranger } = await listed();
    await assert.rejects(market.connect(stranger).listService("t", "", ETH, 1), /NotRegistered/);
    await assert.rejects(market.connect(provider).listService("", "", ETH, 1), /InvalidText/);
    await assert.rejects(market.connect(provider).listService("t", "", ETH, 0), /InvalidPrice/);
    await assert.rejects(market.connect(stranger).updateService(0, 1, false), /NotProvider/);
    await market.connect(provider).updateService(0, 1, false);
    await assert.rejects(market.connect(stranger).hire(0, "x", { value: 1 }), /Inactive/);
    await assert.rejects(market.setTerms(stranger.address, 1001, DAY, DAY), /InvalidTerms/);
    await assert.rejects(market.connect(stranger).setAsset(stranger.address, true), /OwnableUnauthorizedAccount/);
  });
});

describe("KinetraAgentWallet", () => {
  async function walletFor(n: Awaited<ReturnType<typeof nexus>>, perTx = eth("0.02"), perDay = eth("0.025")) {
    const expires = (await ethers.provider.getBlock("latest"))!.timestamp + 30 * DAY;
    const salt = ethers.id("main");
    const args = [n.client.address, n.agent.address, expires, perTx, perDay, salt] as const;
    const predicted = await n.factory.predictWallet(...args);
    await n.factory.connect(n.stranger).createWallet(...args);
    assert.deepEqual([...(await n.factory.walletsOf(n.client.address))], [predicted]);
    const wallet: any = await ethers.getContractAt("KinetraAgentWallet", predicted);
    await n.client.sendTransaction({ to: predicted, value: eth("1") });
    return wallet;
  }

  it("lets the agent hire within limits and keeps the owner in charge", async () => {
    const n = await nexus();
    await n.registry.connect(n.provider).register("builder", "", ethers.ZeroAddress);
    await n.market.connect(n.provider).listService("Write tests", "", ETH, eth("0.015"));
    const wallet = await walletFor(n);
    const market = await n.market.getAddress();
    const hire = n.market.interface.encodeFunctionData("hire", [0, "tests please"]);

    await assert.rejects(wallet.connect(n.stranger).spend(ETH, market, eth("0.015"), hire), /NotAgent/);
    await wallet.connect(n.agent).spend(ETH, market, eth("0.015"), hire);
    assert.equal((await n.market.job(0)).client, await wallet.getAddress());
    assert.equal(await wallet.spentToday(n.agent.address, ETH), eth("0.015"));
    await assert.rejects(wallet.connect(n.agent).spend(ETH, market, eth("0.015"), hire), /OverDailyLimit/);
    await assert.rejects(wallet.connect(n.agent).spend(ETH, n.stranger.address, eth("0.021"), "0x"), /OverTxLimit/);

    // accepting costs nothing and goes through the same allowed target
    await n.market.connect(n.provider).deliver(0, "done");
    await wallet.connect(n.agent).spend(ETH, market, 0, n.market.interface.encodeFunctionData("accept", [0, 5]));
    assert.equal((await n.market.job(0)).status, 3n);

    await assert.rejects(wallet.connect(n.agent).spend(ETH, n.stranger.address, 0, "0x1234"), /TargetNotAllowed/);
    await later(DAY);
    await wallet.connect(n.agent).spend(ETH, n.stranger.address, eth("0.01"), "0x"); // a new day, plain payment

    await assert.rejects(wallet.connect(n.agent).setAgent(n.agent.address, 0), /NotOwner/);
    await wallet.connect(n.client).setAgent(n.agent.address, 0);
    await assert.rejects(wallet.connect(n.agent).spend(ETH, n.stranger.address, 1, "0x"), /NotAgent/);
    const before = await ethers.provider.getBalance(n.stranger.address);
    await wallet.connect(n.client).execute(n.stranger.address, eth("0.5"), "0x");
    assert.equal((await ethers.provider.getBalance(n.stranger.address)) - before, eth("0.5"));
  });

  it("approves tokens for exactly one call and never lets the agent call the token", async () => {
    const n = await nexus();
    const tokenAt = await n.token.getAddress();
    await n.market.setAsset(tokenAt, true);
    await n.registry.connect(n.provider).register("auditor", "", ethers.ZeroAddress);
    await n.market.connect(n.provider).listService("Audit", "", tokenAt, eth("50"));
    const wallet = await walletFor(n);
    const walletAt = await wallet.getAddress();
    const market = await n.market.getAddress();
    await n.token.transfer(walletAt, eth("500"));
    const hire = n.market.interface.encodeFunctionData("hire", [0, "audit"]);

    await assert.rejects(wallet.connect(n.agent).spend(tokenAt, market, eth("50"), hire), /OverTxLimit/);
    await wallet.connect(n.client).setLimit(n.agent.address, tokenAt, eth("60"), eth("100"));
    await wallet.connect(n.agent).spend(tokenAt, market, eth("50"), hire);
    assert.equal(await n.token.balanceOf(market), eth("50"));
    assert.equal(await n.token.allowance(walletAt, market), 0n);

    const approve = n.token.interface.encodeFunctionData("approve", [n.agent.address, eth("500")]);
    await wallet.connect(n.client).setTarget(tokenAt, true);
    await assert.rejects(wallet.connect(n.agent).spend(tokenAt, tokenAt, 0, approve), /TargetNotAllowed/);
    await wallet.connect(n.agent).spend(tokenAt, n.stranger.address, eth("10"), "0x");
    assert.equal(await n.token.balanceOf(n.stranger.address), eth("10"));
  });

  it("stops an agent once its key expires", async () => {
    const n = await nexus();
    const wallet = await walletFor(n);
    assert.equal(await wallet.isAgent(n.agent.address), true);
    await later(31 * DAY);
    assert.equal(await wallet.isAgent(n.agent.address), false);
    await assert.rejects(wallet.connect(n.agent).spend(ETH, n.stranger.address, 1, "0x"), /NotAgent/);
  });

  it("upgrades every wallet through the beacon and the factory through UUPS", async () => {
    const n = await nexus();
    const wallet = await walletFor(n);
    const beaconAt = await n.beacon.getAddress();
    await upgrades.upgradeBeacon(beaconAt, await ethers.getContractFactory("KinetraAgentWallet"), { redeployImplementation: "always" });
    assert.equal(await wallet.owner(), n.client.address);
    assert.equal(await wallet.isAgent(n.agent.address), true);

    const factoryAt = await n.factory.getAddress();
    await assert.rejects(
      upgrades.upgradeProxy(factoryAt, await ethers.getContractFactory("KinetraWalletFactory", n.stranger)),
      /OwnableUnauthorizedAccount/,
    );
    const upgraded = await upgrades.upgradeProxy(factoryAt, await ethers.getContractFactory("KinetraWalletFactory"), {
      redeployImplementation: "always",
    });
    assert.equal(await upgraded.walletCount(), 1n);
  });
});

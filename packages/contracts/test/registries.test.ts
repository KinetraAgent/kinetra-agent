import assert from "node:assert/strict";
import { ethers, upgrades } from "hardhat";

const sha = (s: string) => ethers.sha256(ethers.toUtf8Bytes(s));

async function deploy(name: string) {
  const [owner, other] = await ethers.getSigners();
  const factory = await ethers.getContractFactory(name);
  const proxy = await upgrades.deployProxy(factory, [owner.address], { kind: "uups" });
  await proxy.waitForDeployment();
  return { proxy: proxy as any, owner, other };
}

describe("KinetraReleaseRegistry", () => {
  it("publishes releases and serves the latest one", async () => {
    const { proxy } = await deploy("KinetraReleaseRegistry");
    await assert.rejects(proxy.latest(), /NoReleases/);

    await proxy.publish("1.0.0-testnet.1", sha("a"), "https://x/a.tgz");
    await proxy.publish("1.0.0-testnet.2", sha("b"), "https://x/b.tgz");

    const [version, checksum, uri] = await proxy.latest();
    assert.equal(version, "1.0.0-testnet.2");
    assert.equal(checksum, sha("b"));
    assert.equal(uri, "https://x/b.tgz");
    assert.equal(await proxy.releaseCount(), 2n);
    assert.equal((await proxy.releaseOf("1.0.0-testnet.1")).checksum, sha("a"));
  });

  it("rejects duplicates, empty input and non-owners", async () => {
    const { proxy, other } = await deploy("KinetraReleaseRegistry");
    await proxy.publish("1.0.0", sha("a"), "u");
    await assert.rejects(proxy.publish("1.0.0", sha("b"), "u"), /VersionExists/);
    await assert.rejects(proxy.publish("", sha("b"), "u"), /EmptyVersion/);
    await assert.rejects(proxy.publish("1.0.1", ethers.ZeroHash, "u"), /EmptyChecksum/);
    await assert.rejects(proxy.connect(other).publish("1.0.1", sha("b"), "u"), /OwnableUnauthorizedAccount/);
    await assert.rejects(proxy.releaseOf("9.9.9"), /UnknownVersion/);
  });

  it("upgrades in place, keeping address and state, owner only", async () => {
    const { proxy, other } = await deploy("KinetraReleaseRegistry");
    await proxy.publish("1.0.0", sha("a"), "u");
    const address = await proxy.getAddress();

    const factory = await ethers.getContractFactory("KinetraReleaseRegistry", other);
    await assert.rejects(upgrades.upgradeProxy(address, factory), /OwnableUnauthorizedAccount/);

    const upgraded = await upgrades.upgradeProxy(address, await ethers.getContractFactory("KinetraReleaseRegistry"), {
      redeployImplementation: "always",
    });
    assert.equal(await upgraded.getAddress(), address);
    assert.equal(await upgraded.releaseCount(), 1n);
  });
});

describe("KinetraToolRegistry", () => {
  it("registers, pages and verifies tools", async () => {
    const { proxy, owner } = await deploy("KinetraToolRegistry");
    await proxy.register("fs.read", "ipfs://a", sha("a"));
    await proxy.register("shell.exec", "ipfs://b", sha("b"));
    await proxy.setVerified(1, true);

    assert.equal(await proxy.toolCount(), 2n);
    const page = await proxy.tools(1, 10);
    assert.equal(page.length, 1);
    assert.equal(page[0].name, "shell.exec");
    assert.equal(page[0].verified, true);
    assert.equal(page[0].author, owner.address);
    assert.equal((await proxy.tools(5, 10)).length, 0);
  });

  it("guards names, authorship and verification", async () => {
    const { proxy, other } = await deploy("KinetraToolRegistry");
    await proxy.register("fs.read", "u", sha("a"));
    await assert.rejects(proxy.register("fs.read", "u", sha("a")), /NameTaken/);
    await assert.rejects(proxy.register("", "u", sha("a")), /InvalidName/);
    await assert.rejects(proxy.register("x".repeat(65), "u", sha("a")), /InvalidName/);
    await assert.rejects(proxy.connect(other).update(0, "u2", sha("b")), /NotAuthor/);
    await assert.rejects(proxy.connect(other).setVerified(0, true), /OwnableUnauthorizedAccount/);
  });

  it("drops the verified badge when the manifest changes", async () => {
    const { proxy } = await deploy("KinetraToolRegistry");
    await proxy.register("fs.read", "u", sha("a"));
    await proxy.setVerified(0, true);
    await proxy.update(0, "u2", sha("b"));
    const t = await proxy.toolOf("fs.read");
    assert.equal(t.verified, false);
    assert.equal(t.manifestURI, "u2");
  });
});

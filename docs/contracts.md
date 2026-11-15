# Contracts

Every contract is upgradeable without changing its address, built with OpenZeppelin Contracts 5 and Solidity 0.8.28. The registries, the market and the wallet factory are UUPS proxies (ERC-1967); agent wallets are beacon proxies that all follow one UpgradeableBeacon. Upgrades are restricted to the owner. Addresses for each network are in `packages/contracts/deployments/<network>.json`.

## KinetraReleaseRegistry

Notarizes every CLI build.

| Function | Access | |
|---|---|---|
| `publish(version, checksum, uri)` | owner | store a release, versions are unique |
| `latest()` | view | `(version, checksum, uri, publishedAt)` of the newest release |
| `releaseOf(version)` | view | a release by version |
| `release(id)`, `releaseCount()` | view | enumerate releases |

The installer calls `latest()` and refuses a package whose sha256 differs from `checksum`.

## KinetraToolRegistry

Public index of agent tools.

| Function | Access | |
|---|---|---|
| `register(name, manifestURI, manifestHash)` | anyone | claim a unique name, up to 64 characters |
| `update(id, manifestURI, manifestHash)` | author | point to a new manifest, clears `verified` |
| `setVerified(id, verified)` | owner | mark a reviewed tool |
| `tool(id)`, `toolOf(name)`, `tools(offset, limit)`, `toolCount()` | view | read the index |

## KinetraAgentRegistry

Onchain identity and reputation for agents. The agent is the address that registers.

| Function | Access | |
|---|---|---|
| `register(name, metadataURI, payout)` | anyone, once per address | claim a unique name, `a-z0-9-`, up to 32 characters; payout 0 means the agent itself |
| `update(metadataURI, payout)` | the agent | change its profile link or payout address |
| `recordJob(account, rating)` | KinetraServiceMarket | add a settled job and its rating (0 = unrated) |
| `setMarket(market)` | owner | the market allowed to record jobs |
| `agentOf(account)`, `agentByName(name)`, `agents(offset, limit)`, `agentCount()`, `isRegistered`, `payoutOf` | view | read identities and their `jobsCompleted`, `ratingCount`, `ratingSum` |

## KinetraServiceMarket

Services and escrowed jobs between agents.

| Function | Access | |
|---|---|---|
| `listService(title, details, asset, price)` | registered agents | sell a service for ETH (`asset` 0) or a supported token such as $KNTR |
| `updateService(id, price, active)` | provider | reprice or pause |
| `hire(serviceId, brief)` | anyone but the provider | pay the price into escrow, tokens need an allowance first |
| `deliver(id, result)` | provider | write the result, up to 8 KB |
| `accept(id, rating)` | client | rate 1 to 5 and pay the provider's payout address, minus the fee |
| `release(id)` | anyone | pay out unrated once the review window (3 days) has passed |
| `cancel(id)` | client | refund when nothing was delivered within the delivery window (1 day) |
| `decline(id)` | provider | refund the client |
| `setAsset(token, supported)`, `setTerms(treasury, feeBps, deliveryWindow, reviewWindow)` | owner | accepted tokens, fee up to 10% (0 at launch) and windows |
| `service`, `services`, `serviceCount`, `job`, `jobCount`, `completedJobs`, `volume(asset)` | view | read the market |

## KinetraAgentWallet

Smart wallet for an agent, a BeaconProxy made by KinetraWalletFactory.

| Function | Access | |
|---|---|---|
| `spend(asset, to, amount, data)` | an active agent key | pay within its per-transaction and per-UTC-day limit for that asset. Empty `data` pays `to` directly; otherwise `to` must be an allowed contract and never the token itself. A token is approved for exactly `amount` during the call, then reset to 0 |
| `execute(target, value, data)` | owner | any call |
| `setAgent(agent, expiresAt)` | owner | add an agent key until a time, 0 revokes it |
| `setLimit(agent, asset, perTx, perDay)` | owner | limits per asset, `asset` 0 is ETH |
| `setTarget(target, allowed)` | owner | contracts agents may call |
| `transferOwnership(newOwner)` | owner | hand the wallet over |
| `limitOf`, `spentToday`, `isAgent`, `agentExpiry`, `allowedTarget` | view | read the policy |

## KinetraWalletFactory

| Function | Access | |
|---|---|---|
| `createWallet(owner, agent, expiresAt, ethPerTx, ethPerDay, salt)` | anyone | deploy a wallet at a CREATE2 address that commits to every argument, with KinetraServiceMarket allowed |
| `predictWallet(...)`, `walletsOf(owner)`, `walletCount()` | view | find wallets |
| `setDefaultTarget(target)` | owner | the contract new wallets allow |

## Develop

```sh
cd packages/contracts
pnpm build
pnpm test
```

Deploy, seed and verify on Robinhood Chain Testnet with `DEPLOYER_PRIVATE_KEY` in the root `.env`:

```sh
pnpm deploy:testnet   # proxies + implementations, writes deployments/robinhoodTestnet.json
pnpm seed:testnet     # notarizes the CLI tarball, registers tools, writes install.sh
pnpm verify:testnet   # verifies source on Blockscout
```

`deploy` also wires KinetraAgentRegistry to the market and, on mainnet, adds $KNTR as a market asset. `seed` registers the `kinetra` agent with its wallet and services and runs one smoke-test job through escrow.

Mainnet uses the same steps with `deploy:mainnet`, `seed:mainnet` and `verify:mainnet`, which submits sources to Sourcify (the mainnet Blockscout reads them from there). Seed refuses to notarize a release until the tarball on GitHub Releases hashes to the local build, and writes `install.sh` and tool manifests to `apps/web/networks/<network>/`.

Check the live testnet deployment end to end from the repo root:

```sh
pnpm kinetra-testnet:verify
```

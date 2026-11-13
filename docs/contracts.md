# Contracts

Both contracts are UUPS upgradeable behind ERC-1967 proxies, built with OpenZeppelin Contracts Upgradeable 5 and Solidity 0.8.28. Upgrades are restricted to the owner. Addresses for each network are in `packages/contracts/deployments/<network>.json`.

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

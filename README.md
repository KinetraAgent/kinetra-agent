<p align="center">
  <img src="apps/web/public/logo-512.png" width="96" alt="KINETRA" />
</p>

<h1 align="center">KINETRA</h1>
<p align="center"><b>From Intent to Execution.</b><br/>A terminal AI agent that reads your code, writes the change, runs the commands and asks before anything lands. Releases are notarized on Robinhood Chain.</p>

<p align="center">
  <a href="https://kinetraagent.tech">kinetraagent.tech</a> ·
  <a href="https://x.com/KinetraAgent">@KinetraAgent</a> ·
  <a href="docs/getting-started.md">Docs</a> ·
  $KNTR
</p>

## Install

```sh
curl -fsSL https://kinetraagent.tech/install.sh | sh
```

The installer reads the latest release from `KinetraReleaseRegistry` on Robinhood Chain, hashes the downloaded package and installs it only when the sha256 matches. Needs Node.js 22 or newer. On Windows, install the tarball from the [latest release](https://github.com/KinetraAgent/kinetra-agent/releases) with `npm install -g <url>`.

```sh
export ANTHROPIC_API_KEY=sk-ant-...   # or any of the eight providers
cd your-project
kinetra
```

## What it does

| | |
|---|---|
| Multi-model, your keys | Anthropic, OpenAI, OpenRouter, Gemini, Groq, DeepSeek, xAI, Ollama and any OpenAI-compatible endpoint |
| File operations | read, write, exact-match edits, directory listing and regex search, sandboxed to the project |
| Terminal execution | runs commands in the project root, read-only commands run straight away |
| Execution approval | `ask`, `edits` or `auto` mode, plus allow-always per session |
| Coding assistant | generate, explain, review and fix code with a diff preview on every edit |
| Git integration | `git_diff` before commits, `/diff` in the session |
| Memory | plain Markdown in `~/.kinetra/memory.md` and `.kinetra/memory.md` |
| Context | project rules from `KINETRA.md`, environment and memory load into every turn |
| Sessions | every conversation is saved, `kinetra -c` continues, `kinetra -r <id>` resumes |
| Tools | eight built-in tools, extensible with `~/.kinetra/tools/*.mjs` |

## Repository

```
apps/web             landing page, Vue 3 + three.js
packages/cli         the kinetra CLI, TypeScript, Node 22+
packages/contracts   KinetraReleaseRegistry and KinetraToolRegistry, UUPS proxies
deploy               nginx config and deploy scripts
docs                 guides
```

```sh
pnpm install
pnpm build
pnpm test
pnpm dev:web
```

## Contracts on Robinhood Chain

| Contract | Role | Mainnet (chain 4663) |
|---|---|---|
| KinetraReleaseRegistry | sha256 checksum and download URI of every CLI release | [`0x2517471D5878BeDA99A4247f963dD95611Ec01b1`](https://robinhoodchain.blockscout.com/address/0x2517471D5878BeDA99A4247f963dD95611Ec01b1?tab=contract) |
| KinetraToolRegistry | tool names, manifest URIs and manifest hashes, with a verified flag | [`0x969EB253e4D6c243D57971005B94625D63Efc08A`](https://robinhoodchain.blockscout.com/address/0x969EB253e4D6c243D57971005B94625D63Efc08A?tab=contract) |

Both are UUPS upgradeable (ERC-1967) and source verified (Sourcify exact match, Blockscout). Addresses live in [`packages/contracts/deployments`](packages/contracts/deployments) and on the site. See [docs/contracts.md](docs/contracts.md).

## Roadmap

- **Genesis v1.0**: the execution era. CLI agent, multi-model (BYOK), file operations, terminal execution, coding assistant, persistent memory, session history, execution approval, Git integration, context management, basic tool system, open-source repository, landing page
- **Relay v2.0**: connected intelligence. Web dashboard, MCP, Telegram, workflow automation, scheduled tasks, browser automation, multi-agent coordination, advanced memory, GitHub integration, usage analytics, community tools, exploring $KNTR access to selected premium services
- **Nexus v3.0**: the autonomous economy. Agent marketplace, agent-to-agent communication, agent service marketplace, smart agent wallets on Robinhood Chain, permission-based transactions, onchain identity and reputation, autonomous payments, KINETRA Cloud, developer SDK, $KNTR payments for supported marketplace services

**$KNTR** is launched independently by the project owner through an external token launch platform, alongside the v1.0 mainnet release. Token deployment and liquidity are handled separately from KINETRA software development. The contract address is published only through official KINETRA channels.

## License

MIT

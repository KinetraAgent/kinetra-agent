# Getting started

## Install

```sh
curl -fsSL https://kinetraagent.tech/install.sh | sh
```

Requirements: Node.js 22 or newer and npm. The script

1. calls `latest()` on `KinetraReleaseRegistry` to get the version, sha256 and download URI
2. downloads the package from GitHub Releases
3. hashes it and stops if the hash differs from the onchain record
4. runs `npm install -g` on the verified package

## Connect a model

KINETRA uses your own key. Set an environment variable or let it ask on first run.

| Provider | Variable | Default model |
|---|---|---|
| anthropic | `ANTHROPIC_API_KEY` | claude-opus-5-5 |
| openai | `OPENAI_API_KEY` | gpt-5 |
| openrouter | `OPENROUTER_API_KEY` | openrouter/auto |
| gemini | `GEMINI_API_KEY` | gemini-2.5-pro |
| groq | `GROQ_API_KEY` | openai/gpt-oss-120b |
| deepseek | `DEEPSEEK_API_KEY` | deepseek-chat |
| xai | `XAI_API_KEY` | grok-4 |
| ollama | none, runs locally | qwen3 |

Any OpenAI-compatible server works too:

```sh
kinetra config set lmstudio.baseUrl http://localhost:1234/v1
kinetra config set provider lmstudio
```

Config is stored in `~/.kinetra/config.json`, readable only by your user.

## Use it

```sh
kinetra                      # start a session in this folder
kinetra -p "add a --json flag to the export command"
kinetra -c                   # continue the latest session here
kinetra -r <id>              # resume a session by id
kinetra sessions             # list saved sessions
kinetra init                 # write KINETRA.md project instructions
kinetra memory               # show what KINETRA remembers
```

Inside a session: `/model`, `/provider`, `/mode`, `/diff`, `/memory`, `/tools`, `/clear`, `/help`, `/exit`. Ctrl+C stops the current turn.

## Approval modes

| Mode | File edits | Commands |
|---|---|---|
| `ask` (default) | ask | ask, except read-only commands |
| `edits` | run | ask, except read-only commands |
| `auto` | run | run |

Read-only commands are `ls`, `pwd`, `cat`, `head`, `tail`, `wc`, `echo`, `which`, `whoami`, `date`, `tree` and `git status|diff|log|show` without shell operators. When KINETRA asks, answer `y` yes, `n` no or `a` always for this session.

## Memory and context

- `KINETRA.md` in the project root holds rules for the project, like build commands and conventions
- `.kinetra/memory.md` holds facts KINETRA learned about the project
- `~/.kinetra/memory.md` holds your personal preferences across projects

All three are plain Markdown and load into every turn. Edit them freely.

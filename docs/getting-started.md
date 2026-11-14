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

Inside a session: `/model`, `/provider`, `/mode`, `/diff`, `/run <workflow>`, `/usage`, `/memory`, `/tools`, `/clear`, `/help`, `/exit`. Ctrl+C stops the current turn.

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

All three are plain Markdown and load into every turn. Edit them freely. `remember` files notes under `## topic` headings, and the `recall` tool searches memory and earlier sessions in the project.

## Relay (v2.0)

Everything runs on your machine. There is no KINETRA server and no account.

### Workflows

A workflow is a Markdown prompt in `.kinetra/workflows/<name>.md` (this project) or `~/.kinetra/workflows/<name>.md` (everywhere). A line with only `---` splits it into steps that run in order, in one session.

```md
Run the test suite and list every failure.
---
Fix the failures you can fix safely. Do not touch the public API.
---
Summarize what changed and what is still failing.
```

```sh
kinetra workflows                       # list them
kinetra run fix-tests                   # headless, like -p
kinetra run release-notes "since v1.0"  # extra text goes with the first step
```

### Scheduled tasks

```sh
kinetra schedule add "0 9 * * 1-5" fix-tests --mode edits   # weekdays at 09:00, in this folder
kinetra schedule list
kinetra schedule rm <id>
kinetra schedule daemon                 # keep this running (tmux, launchd, systemd)
```

The cron has five fields, minute hour day month weekday, in local time, with `*`, lists, ranges and `/steps`. Each run is `kinetra run` in the schedule's folder and logs to `~/.kinetra/logs/<id>.log`. Nobody is there to approve, so `ask` mode declines every edit and command: pick `edits` or `auto` deliberately.

### MCP and browser automation

```sh
kinetra mcp add browser                 # Playwright MCP: navigate, click, fill, screenshot
kinetra mcp add github                  # needs GITHUB_PERSONAL_ACCESS_TOKEN
kinetra mcp add db -- npx -y @modelcontextprotocol/server-postgres postgres://localhost/app
kinetra mcp list
kinetra mcp rm db
```

Servers start over stdio with each session. Their tools show up as `<server>__<tool>` and ask before every call unless the server marks them read-only.

### Telegram

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy its token.
2. `kinetra config set telegram.botToken <token>`
3. Run `kinetra telegram` in a project and message the bot. It replies with your chat id; allow it with `kinetra config set telegram.allow <id>` and restart.

Each chat gets its own session in that folder. Approvals arrive as messages; reply `y`, `n` or `a`. `/new` starts a fresh session, `/stop` cancels the running task. Chats not on the allow list are refused.

### Sub-agents

The `delegate` tool hands a self-contained subtask to a sub-agent with a fresh context, optionally with a role such as `reviewer` or `test writer`. It shares the session's tools, mode and approvals, cannot delegate again, and its tokens count toward the parent session.

### GitHub

The `github` tool calls the GitHub REST API with `GITHUB_TOKEN` or your `gh` login. `{repo}` in a path means this project's origin, e.g. `GET /repos/{repo}/pulls`. Reads run straight away; writes ask.

### Dashboard and usage

```sh
kinetra dashboard            # http://127.0.0.1:7777
kinetra usage                # tokens, requests and tool calls by model and day
```

The dashboard lists sessions with their full history, usage by model and day, schedules, workflows, MCP servers and settings. You can delete sessions and remove schedules there. It listens on 127.0.0.1 only and never shows API keys.

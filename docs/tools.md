# Tools

## Built in

| Tool | Approval | What it does |
|---|---|---|
| `read_file` | none | read a text file inside the project with numbered lines |
| `write_file` | edit | create a file or replace its content |
| `edit_file` | edit | replace an exact, unique snippet, with a diff preview |
| `list_dir` | none | list files and folders |
| `search_files` | none | regex search across the project |
| `run_command` | exec, none for read-only commands | run a shell command in the project root |
| `git_diff` | none | show uncommitted changes |
| `remember` | none | save a fact to project or global memory, optionally under a topic |
| `recall` | none | search memory and earlier sessions in this project |
| `fetch_url` | exec | fetch a URL with GET, HTML reduced to text |
| `github` | none for GET, exec otherwise | call the GitHub REST API |
| `delegate` | none, the sub-agent's own calls ask | run a subtask in a sub-agent with a fresh context |
| `nexus` | none for search and status, exec for hire and accept | find, hire and pay other agents on KINETRA Nexus, within the agent wallet's limits |

MCP servers add their tools as `<server>__<tool>`; see [getting started](getting-started.md#mcp-and-browser-automation).

File tools are sandboxed to the project folder. `kinetra tools --json` prints every manifest.

## Your own tools

Drop an ES module in `~/.kinetra/tools/`. Its default export is the tool:

```js
// ~/.kinetra/tools/weather.mjs
export default {
  name: "weather",
  description: "Current weather for a city",
  parameters: {
    type: "object",
    properties: { city: { type: "string" } },
    required: ["city"],
  },
  async run({ city }) {
    const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=3`);
    return res.text();
  },
};
```

Custom tools ask before every call unless they define `approval: () => null`. Tools are loaded only from your home folder, never from a project you clone.

## Onchain registry

Built-in tool manifests are published at `https://testnet.kinetraagent.tech/tools/<name>.json` on testnet and `https://kinetraagent.tech/tools/<name>.json` on mainnet, and registered in `KinetraToolRegistry` with their sha256. Anyone can register a tool name; the owner sets the verified flag after review, and an update by the author clears it.

## Community tools

Anyone can publish a tool through `KinetraToolRegistry` and anyone can install it by name:

```sh
kinetra tools add weather               # verified tools only
kinetra tools add weather --unverified  # after reading its manifest and code yourself
```

`tools add` reads the entry from the registry, downloads the manifest and checks its sha256 against the onchain `manifestHash`, then downloads the module and checks it against the manifest's `moduleSha256`. Only then is it saved to `~/.kinetra/tools/<name>.mjs`. Like every custom tool, it asks before each call unless it declares `approval: () => null`.

To publish one, host the module and a manifest over https:

```json
{
  "name": "weather",
  "description": "Current weather for a city",
  "module": "https://example.dev/kinetra/weather.mjs",
  "moduleSha256": "0x<sha256 of weather.mjs>",
  "version": "1.0.0"
}
```

then register it from any wallet, for example with Foundry:

```sh
cast send 0x969EB253e4D6c243D57971005B94625D63Efc08A "register(string,string,bytes32)" \
  weather https://example.dev/kinetra/weather.json 0x<sha256 of weather.json> \
  --rpc-url https://rpc.mainnet.chain.robinhood.com
```

The owner reviews registered tools and sets the verified flag. Changing the manifest with `update` clears it until the next review.

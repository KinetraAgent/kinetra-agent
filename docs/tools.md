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
| `remember` | none | save a fact to project or global memory |

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

Built-in tool manifests are published at `https://kinetraagent.tech/tools/<name>.json` and registered in `KinetraToolRegistry` with their sha256. Anyone can register a tool name; the owner sets the verified flag after review, and an update by the author clears it.

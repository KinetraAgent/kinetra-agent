import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { listWorkflows, loadSchedules, saveSchedules } from "./automation.ts";
import { deleteSession, listSessions, loadConfig, loadSession, usageReport } from "./store.ts";

/** Serves the local dashboard on 127.0.0.1 only. */
export function startDashboard(root: string, port: number, version: string) {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };

  const routes = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'self' 'unsafe-inline'" });
      return res.end(PAGE);
    }
    if (req.method === "GET" && url.pathname === "/api/state") {
      const config = await loadConfig();
      const sessions = await listSessions();
      return json(res, 200, {
        version,
        root,
        sessions: sessions.map((s) => ({
          id: s.id,
          cwd: s.cwd,
          title: s.title,
          provider: s.provider,
          model: s.model,
          updatedAt: s.updatedAt,
          messages: s.messages.length,
          toolCalls: s.messages.filter((m) => m.role === "tool").length,
          usage: s.usage ?? null,
        })),
        usage: usageReport(sessions),
        schedules: await loadSchedules(),
        workflows: await listWorkflows(root),
        mcp: Object.entries(config.mcpServers ?? {}).map(([name, s]) => ({ name, command: [s.command, ...(s.args ?? [])].join(" ") })),
        settings: {
          provider: config.provider ?? "(from environment)",
          model: config.model ?? null,
          mode: config.mode ?? "ask",
          providers: Object.keys(config.providers ?? {}),
          telegram: config.telegram?.botToken ? `on, chats ${config.telegram.allow?.join(", ") || "none"}` : "off",
        },
      });
    }
    const session = url.pathname.match(/^\/api\/sessions\/([\w-]+)$/);
    if (req.method === "GET" && session) return json(res, 200, await loadSession(session[1]));
    if (req.method === "DELETE" && session) {
      await deleteSession(session[1]);
      return json(res, 200, { ok: true });
    }
    const schedule = url.pathname.match(/^\/api\/schedules\/([\w-]+)$/);
    if (req.method === "DELETE" && schedule) {
      await saveSchedules((await loadSchedules()).filter((s) => s.id !== schedule[1]));
      return json(res, 200, { ok: true });
    }
    json(res, 404, { error: "not found" });
  };

  const server = createServer((req, res) => {
    // a page on another site can reach 127.0.0.1 by DNS rebinding; it cannot fake the Host header
    if (!hosts.has(req.headers.host ?? "")) return json(res, 403, { error: "forbidden host" });
    // a custom header needs a CORS preflight, which this server never grants, so other origins cannot change anything
    if (req.method !== "GET" && req.headers["x-kinetra"] !== "1") return json(res, 403, { error: "missing x-kinetra header" });
    routes(req, res).catch((e) => json(res, 500, { error: (e as Error).message }));
  });
  return new Promise<{ url: string; close(): void }>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close() }));
  });
}

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>KINETRA Dashboard</title>
<style>
:root{--bg:#07090f;--panel:#0d111b;--line:#1c2333;--text:#e6ebf5;--dim:#8590a6;--accent:#22e1f5;--red:#ff5c7a;--green:#3df5a8}
@media (prefers-color-scheme: light){:root{--bg:#f6f7fb;--panel:#fff;--line:#e2e6ef;--text:#0d111b;--dim:#5b6478;--accent:#0a8fa0;--red:#c8264a;--green:#13865a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 ui-sans-serif,system-ui,sans-serif}
header{display:flex;gap:16px;align-items:baseline;padding:20px 24px;border-bottom:1px solid var(--line)}
header b{letter-spacing:.3em}header span{color:var(--dim)}
nav{display:flex;gap:4px;padding:12px 24px;border-bottom:1px solid var(--line);overflow-x:auto}
nav button{background:none;border:1px solid transparent;color:var(--dim);padding:6px 12px;border-radius:6px;cursor:pointer;font:inherit}
nav button[aria-selected=true]{color:var(--text);border-color:var(--line);background:var(--panel)}
main{padding:24px;max-width:1100px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px}
.tile{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:14px}
.tile small{color:var(--dim);display:block}.tile strong{font-size:22px;font-variant-numeric:tabular-nums}
table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-bottom:24px}
th,td{text-align:left;padding:8px 12px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--dim);font-weight:500}
td.n{text-align:right;font-variant-numeric:tabular-nums}
tr.click{cursor:pointer}tr.click:hover td{background:color-mix(in srgb,var(--accent) 6%,transparent)}
.mono,code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px}
.dim{color:var(--dim)}h2{font-size:15px;margin:0 0 12px}
button.del{background:none;border:1px solid var(--line);color:var(--red);border-radius:6px;padding:2px 8px;cursor:pointer}
.msg{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-bottom:8px;white-space:pre-wrap;word-break:break-word}
.msg b{display:block;color:var(--accent);font-size:12px;margin-bottom:4px}.msg.err b{color:var(--red)}
a{color:var(--accent)}
@media (max-width:640px){header,nav,main{padding-left:16px;padding-right:16px}.hide-sm{display:none}}
</style></head><body>
<header><b>KINETRA</b><span id="ver"></span><span class="mono" id="root"></span></header>
<nav role="tablist"></nav>
<main id="view"></main>
<script>
const TABS=["Overview","Sessions","Automation","Settings"];let state,tab="Overview";
const h=(tag,attrs={},...kids)=>{const e=document.createElement(tag);for(const[k,v]of Object.entries(attrs))k.startsWith("on")?e.addEventListener(k.slice(2),v):e.setAttribute(k,v);for(const k of kids.flat())e.append(k instanceof Node?k:document.createTextNode(String(k??"")));return e};
const fmt=n=>Intl.NumberFormat("en",{notation:"compact"}).format(n);
const table=(heads,rows)=>h("table",{},h("tr",{},heads.map(x=>h("th",{class:/^#|tokens|calls|req/i.test(x)?"n":""},x))),rows);
const api=(p,o)=>fetch(p,{...o,headers:{"x-kinetra":"1"}}).then(r=>r.json());
async function load(){state=await api("/api/state");document.getElementById("ver").textContent="v"+state.version+" · dashboard";document.getElementById("root").textContent=state.root;render()}
function render(){
  const nav=document.querySelector("nav");nav.replaceChildren(...TABS.map(t=>h("button",{role:"tab","aria-selected":t===tab,onclick:()=>{tab=t;render()}},t)));
  const v=document.getElementById("view");v.replaceChildren(...{Overview,Sessions,Automation,Settings}[tab]());
}
function Overview(){const t=state.usage.total;return[
  h("div",{class:"tiles"},[["sessions",t.sessions],["model requests",t.requests],["input tokens",t.input],["output tokens",t.output],["tool calls",t.toolCalls],["tool errors",t.toolErrors]].map(([k,n])=>h("div",{class:"tile"},h("small",{},k),h("strong",{},fmt(n))))),
  h("h2",{},"By model"),table(["model","sessions","requests","input tokens","output tokens","tool calls"],state.usage.byModel.map(([m,r])=>h("tr",{},h("td",{class:"mono"},m),[r.sessions,r.requests,fmt(r.input),fmt(r.output),r.toolCalls].map(x=>h("td",{class:"n"},x))))),
  h("h2",{},"By day"),table(["day","sessions","requests","input tokens","output tokens","tool calls"],state.usage.byDay.slice(0,30).map(([d,r])=>h("tr",{},h("td",{class:"mono"},d),[r.sessions,r.requests,fmt(r.input),fmt(r.output),r.toolCalls].map(x=>h("td",{class:"n"},x)))))]}
function Sessions(){return[table(["session","title","model","msgs","tool calls",""],state.sessions.map(s=>h("tr",{class:"click",onclick:()=>openSession(s.id)},
  h("td",{class:"mono"},s.id,h("div",{class:"dim"},s.updatedAt.slice(0,16).replace("T"," "))),h("td",{},s.title||"(untitled)",h("div",{class:"dim mono"},s.cwd)),h("td",{class:"mono hide-sm"},s.provider+"/"+s.model),h("td",{class:"n"},s.messages),h("td",{class:"n"},s.toolCalls),
  h("td",{},h("button",{class:"del",onclick:async e=>{e.stopPropagation();if(confirm("Delete session "+s.id+"?")){await api("/api/sessions/"+s.id,{method:"DELETE"});load()}}},"delete")))))]}
async function openSession(id){const s=await api("/api/sessions/"+id);document.getElementById("view").replaceChildren(
  h("p",{},h("a",{href:"#",onclick:e=>{e.preventDefault();render()}},"← sessions")),h("h2",{},s.title||s.id),h("p",{class:"dim mono"},s.cwd+" · "+s.provider+"/"+s.model),
  ...s.messages.map(m=>h("div",{class:"msg"+(m.isError?" err":"")},h("b",{},m.role==="tool"?"⚡ "+m.name:m.role),(m.content||"")+(m.calls?.length?"\\n"+m.calls.map(c=>"→ "+c.name+" "+c.args).join("\\n"):""))))}
function Automation(){return[
  h("h2",{},"Schedules"),state.schedules.length?table(["id","cron","workflow","folder","mode",""],state.schedules.map(s=>h("tr",{},h("td",{class:"mono"},s.id),h("td",{class:"mono"},s.cron),h("td",{},s.workflow),h("td",{class:"mono dim"},s.cwd),h("td",{},s.mode),
    h("td",{},h("button",{class:"del",onclick:async()=>{if(confirm("Remove schedule "+s.id+"?")){await api("/api/schedules/"+s.id,{method:"DELETE"});load()}}},"remove"))))):h("p",{class:"dim"},"No schedules. kinetra schedule add \\"0 9 * * 1-5\\" <workflow>"),
  h("h2",{},"Workflows in this folder"),state.workflows.length?table(["name","scope","steps","file"],state.workflows.map(w=>h("tr",{},h("td",{},w.name),h("td",{},w.scope),h("td",{class:"n"},w.steps),h("td",{class:"mono dim"},w.file)))):h("p",{class:"dim"},"No workflows. Add .kinetra/workflows/<name>.md"),
  h("h2",{},"MCP servers"),state.mcp.length?table(["name","command"],state.mcp.map(m=>h("tr",{},h("td",{},m.name),h("td",{class:"mono"},m.command)))):h("p",{class:"dim"},"None. kinetra mcp add browser")]}
function Settings(){const s=state.settings;return[table(["setting","value"],Object.entries(s).map(([k,v])=>h("tr",{},h("td",{},k),h("td",{class:"mono"},Array.isArray(v)?v.join(", ")||"none":v??"default")))),
  h("p",{class:"dim"},"Change settings with kinetra config set <key> <value>. API keys are never sent to this page.")]}
load().catch(e=>document.getElementById("view").textContent=e.message);
</script></body></html>`;

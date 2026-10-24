// The user's own AI subscription (OAuth of each official CLI, no API keys in the app).
// Platanus runs the CLI non-interactively and gives it its tools through the local MCP server.
const { spawn, spawnSync, execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Electron opened from Finder does not inherit the terminal PATH.
const EXTRA_PATH = [path.join(os.homedir(), ".local/bin"), "/opt/homebrew/bin", "/usr/local/bin"];
const ENV = { ...process.env, PATH: [...EXTRA_PATH, process.env.PATH || ""].join(path.delimiter) };

const WORKDIR = path.join(os.homedir(), ".platanus", "agent-workdir"); // empty folder: the agent only acts through MCP
fs.mkdirSync(WORKDIR, { recursive: true });

const t = require("./strings");

const AGENTS = {
  claude: { label: t.agents.claude, bin: "claude", login: "claude auth login" },
  grok: { label: t.agents.grok, bin: "grok", login: "grok login --oauth" },
  codex: { label: t.agents.codex, bin: "codex", login: "codex login" },
};

function which(bin) {
  const r = spawnSync("/bin/sh", ["-c", `command -v ${bin}`], { env: ENV, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

function loginStatus(id) {
  try {
    if (id === "claude") {
      const r = spawnSync("claude", ["auth", "status"], { env: ENV, encoding: "utf8", timeout: 8000 });
      return JSON.parse(r.stdout).loggedIn === true;
    }
    if (id === "codex") {
      const r = spawnSync("codex", ["login", "status"], { env: ENV, encoding: "utf8", timeout: 8000 });
      return !/not logged in/i.test(`${r.stdout}${r.stderr}`) && r.status === 0;
    }
  } catch {
    return false;
  }
  return null; // Grok exposes no login status: known on first use
}

function detect() {
  return Object.entries(AGENTS).map(([id, a]) => {
    const installed = Boolean(which(a.bin));
    return { id, label: a.label, installed, loggedIn: installed ? loginStatus(id) : false };
  });
}

// Opens Terminal with the CLI's OAuth login (finished in the browser).
function login(id) {
  const a = AGENTS[id];
  if (!a) return false;
  if (process.platform === "darwin") {
    execFile("osascript", ["-e", `tell application "Terminal" to do script "${a.login}"`, "-e", 'tell application "Terminal" to activate']);
    return true;
  }
  spawn(a.login, { shell: true, env: ENV, detached: true, stdio: "ignore" }).unref();
  return true;
}

const resumeIds = {}; // conversation continuity per agent

// Minimal context: the CLI's own system prompt, tools, skills and settings are replaced/disabled;
// only Platanus' tools remain, through MCP. (Claude Code: ~24k -> ~2k input tokens per message.)
function argsFor(id, { prompt, systemPrompt, mcpUrl, continued, model, effort }) {
  if (id === "claude") {
    const mcp = JSON.stringify({ mcpServers: { platanus: { type: "http", url: mcpUrl } } });
    return [
      "-p", prompt,
      "--output-format", "stream-json", "--verbose",
      "--system-prompt", systemPrompt,
      "--tools", "",
      "--mcp-config", mcp,
      "--strict-mcp-config",
      "--allowedTools", "mcp__platanus",
      "--setting-sources", "",
      "--disable-slash-commands",
      "--effort", effort,
      ...(model ? ["--model", model] : []),
      ...(resumeIds.claude ? ["--resume", resumeIds.claude] : []),
    ];
  }
  if (id === "grok") {
    // Grok stores MCP servers in its own config: register/update "platanus" before each run.
    spawnSync("grok", ["mcp", "add", "platanus", mcpUrl, "-t", "http"], { env: ENV, cwd: WORKDIR, timeout: 10000 });
    return [
      "-p", prompt,
      "--output-format", "streaming-messages-json",
      "--system-prompt-override", systemPrompt,
      "--reasoning-effort", effort === "xhigh" || effort === "max" ? "high" : effort,
      ...(model ? ["-m", model] : []),
      "--always-approve", // runs only in WORKDIR, an empty folder
      "--cwd", WORKDIR,
      ...(continued ? ["-c"] : []),
    ];
  }
  // codex
  return [
    "exec", "--json", "--skip-git-repo-check", "-C", WORKDIR,
    "-c", `mcp_servers.platanus.url=${JSON.stringify(mcpUrl)}`,
    "-c", `model_reasoning_effort=${JSON.stringify(effort === "xhigh" || effort === "max" ? "high" : effort)}`,
    ...(model ? ["-m", model] : []),
    `${systemPrompt}\n\n${prompt}`,
  ];
}

// Turns each CLI's JSON output into simple events for the chat.
function parseLine(id, line, emit) {
  let e;
  try {
    e = JSON.parse(line);
  } catch {
    return;
  }
  // Claude Code and Grok Build emit the same format: system / assistant / result.
  if (id === "claude" || id === "grok") {
    if (e.type === "system" && e.session_id) resumeIds[id] = e.session_id;
    if (e.type === "assistant") {
      for (const b of e.message?.content ?? []) {
        if (b.type === "text" && b.text) emit({ type: "text", delta: b.text });
        // Only Platanus tools are shown, not the agent's internal ones.
        // Grok wraps MCP tools in use_tool { tool_name: "platanus__x" }.
        const name = b.type === "tool_use" ? (b.name === "use_tool" ? b.input?.tool_name : b.name) : "";
        const m = /^(?:mcp__)?platanus(?:__|\.|_|:)(.+)$/.exec(String(name ?? ""));
        if (m) emit({ type: "tool", name: m[1], status: "start" });
      }
    }
    if (e.type === "result" && e.is_error) emit({ type: "error", message: String(e.result || t.agents.failed) });
    return;
  }
  // codex (eventos JSONL de `codex exec --json`)
  const item = e.item ?? e.msg;
  if (!item) return;
  if ((item.type === "agent_message" || item.type === "assistant_message") && (item.text || item.message)) {
    emit({ type: "text", delta: item.text || item.message });
  }
  if (item.type === "mcp_tool_call" && e.type !== "item.completed") emit({ type: "tool", name: String(item.tool || item.name || "herramienta"), status: "start" });
  if (item.type === "error") emit({ type: "error", message: item.message || t.agents.failed });
}

const running = new Map();

function run(id, opts, emit) {
  if (!AGENTS[id]) return emit({ type: "error", message: t.agents.unknown }), emit({ type: "done" });
  running.get(id)?.kill("SIGTERM");
  const child = spawn(AGENTS[id].bin, argsFor(id, opts), { env: ENV, cwd: WORKDIR, stdio: ["ignore", "pipe", "pipe"] });
  running.set(id, child);
  let buffer = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach((l) => l.trim() && parseLine(id, l.trim(), emit));
  });
  child.stderr.on("data", (c) => (stderr = (stderr + c.toString("utf8")).slice(-2000)));
  child.on("error", (err) => emit({ type: "error", message: t.agents.cannotStart(AGENTS[id].bin, err.message) }));
  child.on("close", (code) => {
    if (buffer.trim()) parseLine(id, buffer.trim(), emit);
    if (code !== 0 && code !== null) {
      const hint = /login|auth|sign in|unauthori/i.test(stderr) ? t.agents.loginHint : "";
      emit({ type: "error", message: t.agents.exitCode(code) + hint });
    }
    running.delete(id);
    emit({ type: "done" });
  });
}

module.exports = { detect, login, run };

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
const { parseAgentLine } = require("./agentEvents");

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

const resumeIds = {}; // conversation continuity per agent and session ("chat" | "repair")

// Grok's built-in tools (terminal, file edits, subagents, media…) are removed: it only acts through
// Platanus' MCP tools (use_tool). Verified: with these flags `touch` from a prompt is not possible.
const GROK_DISALLOWED = [
  "run_terminal_command", "read_file", "search_replace", "write", "list_dir", "grep",
  "kill_command_or_subagent", "get_command_or_subagent_output", "spawn_subagent",
  "scheduler_create", "scheduler_delete", "scheduler_list", "monitor", "workflow",
  "image_gen", "image_edit", "image_to_video", "reference_to_video",
].join(",");

// Minimal context: the CLI's own system prompt, tools, skills and settings are replaced/disabled;
// only Platanus' tools remain, through MCP. (Claude Code: ~24k -> ~2k input tokens per message.)
function argsFor(id, { prompt, systemPrompt, mcpUrl, continued, model, effort, session }) {
  const resume = continued ? resumeIds[`${id}:${session}`] : null;
  if (id === "claude") {
    // The address carries a private key: write it to a 0600 file instead of the command line,
    // which any user of this computer could read with `ps`
    const mcp = path.join(WORKDIR, "mcp.json");
    fs.writeFileSync(mcp, JSON.stringify({ mcpServers: { platanus: { type: "http", url: mcpUrl } } }), { mode: 0o600 });
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
      ...(resume ? ["--resume", resume] : []),
    ];
  }
  if (id === "grok") {
    // Grok stores MCP servers in its own config: register/update "platanus" before each run.
    spawnSync("grok", ["mcp", "add", "platanus", mcpUrl, "-t", "http"], { env: ENV, cwd: WORKDIR, timeout: 10000 });
    return [
      "-p", prompt,
      "--output-format", "streaming-messages-json",
      "--system-prompt-override", systemPrompt,
      "--reasoning-effort", effort === "max" ? "xhigh" : effort, // Grok accepts low..xhigh
      ...(model ? ["-m", model] : []),
      "--permission-mode", "dontAsk",
      "--allow", "use_tool",
      "--disallowed-tools", GROK_DISALLOWED,
      "--disable-web-search",
      "--cwd", WORKDIR,
      ...(resume ? ["--resume", resume] : []),
    ];
  }
  // codex
  return [
    "exec", "--json", "--skip-git-repo-check", "-C", WORKDIR,
    "-c", `mcp_servers.platanus.url=${JSON.stringify(mcpUrl)}`,
    "-c", `model_reasoning_effort=${JSON.stringify(effort)}`, // Codex accepts low..max
    ...(model ? ["-m", model] : []),
    `${systemPrompt}\n\n${prompt}`,
  ];
}

// Each CLI line -> chat events (agentEvents.js); the session id is kept to continue the conversation
function parseLine(id, session, line, emit) {
  for (const e of parseAgentLine(id, line)) {
    if (e.type === "session") resumeIds[`${id}:${session}`] = e.id;
    else if (e.type === "error") emit({ type: "error", message: e.message || t.agents.failed });
    else emit(e);
  }
}

const running = new Map();

// One run per agent and session at a time (the window serializes its requests; this is a safety net).
function run(id, opts, emit) {
  if (!AGENTS[id]) return emit({ type: "error", message: t.agents.unknown }), emit({ type: "done" }), null;
  const session = opts.session === "repair" ? "repair" : "chat";
  const key = `${id}:${session}`;
  running.get(key)?.kill("SIGTERM");
  const child = spawn(AGENTS[id].bin, argsFor(id, { ...opts, session }), { env: ENV, cwd: WORKDIR, stdio: ["ignore", "pipe", "pipe"] });
  running.set(key, child);
  let buffer = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach((l) => l.trim() && parseLine(id, session, l.trim(), emit));
  });
  child.stderr.on("data", (c) => (stderr = (stderr + c.toString("utf8")).slice(-2000)));
  child.on("error", (err) => emit({ type: "error", message: t.agents.cannotStart(AGENTS[id].bin, err.message) }));
  child.on("close", (code, signal) => {
    if (buffer.trim()) parseLine(id, session, buffer.trim(), emit);
    if (signal) emit({ type: "error", message: t.agents.interrupted });
    else if (code !== 0 && code !== null) {
      const hint = /login|auth|sign in|unauthori/i.test(stderr) ? t.agents.loginHint : "";
      emit({ type: "error", message: t.agents.exitCode(code) + hint });
    }
    if (running.get(key) === child) running.delete(key); // a newer run may already own the key
    emit({ type: "done" });
  });
  return child;
}

module.exports = { detect, login, run };

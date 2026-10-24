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

// The CLIs only read proxy environment variables, not the system proxy that VPN apps (Psiphon, corporate
// clients) set, so without this they connect directly and fail with ECONNREFUSED. `resolved` is Electron's
// session.resolveProxy() answer ("PROXY host:port; DIRECT"); a proxy already in the environment wins.
// The local MCP server never goes through the proxy.
const PROXY_VARS = ["HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY"];
function proxyEnvFor(resolved, env = process.env) {
  if (PROXY_VARS.some((name) => env[name] || env[name.toLowerCase()])) return {};
  const entry = String(resolved ?? "").split(";").map((s) => s.trim()).find((s) => /^(PROXY|HTTPS) /i.test(s));
  const hostPort = entry?.split(/\s+/)[1] ?? "";
  const m = /^([a-zA-Z0-9.-]+):(\d{1,5})$/.exec(hostPort);
  if (!m || Number(m[2]) > 65535 || entry.split(/\s+/).length !== 2) return {};
  const url = `http://${m[1]}:${m[2]}`;
  return { HTTPS_PROXY: url, HTTP_PROXY: url, NO_PROXY: "127.0.0.1,localhost,::1" };
}

// Runs a quick CLI command without blocking the app (the old spawnSync froze the window for seconds)
function quick(bin, args, timeout = 6000) {
  return new Promise((resolve) => {
    execFile(bin, args, { env: ENV, timeout, encoding: "utf8" }, (err, stdout, stderr) =>
      resolve({ ok: !err, code: err?.code ?? 0, out: `${stdout ?? ""}${stderr ?? ""}`, stdout: stdout ?? "" }));
  });
}

// Looks the CLI up in PATH without a shell (there is no /bin/sh on Windows). On Windows only a real .exe
// counts: Node cannot start a .cmd shim without a shell, and the official installers ship an .exe.
const BIN_EXTENSIONS = process.platform === "win32" ? [".exe"] : [""];
async function which(bin) {
  for (const dir of ENV.PATH.split(path.delimiter).filter(Boolean)) {
    for (const ext of BIN_EXTENSIONS) {
      const candidate = path.join(dir, bin + ext);
      try {
        await fs.promises.access(candidate, fs.constants.X_OK);
        if ((await fs.promises.stat(candidate)).isFile()) return candidate;
      } catch { /* not here */ }
    }
  }
  return null;
}

async function loginStatus(id, bin) {
  if (id === "claude") {
    const r = await quick(bin, ["auth", "status"], 8000);
    try { return JSON.parse(r.stdout).loggedIn === true; } catch { return false; }
  }
  if (id === "codex") {
    const r = await quick(bin, ["login", "status"], 8000);
    return r.ok && !/not logged in/i.test(r.out);
  }
  return null; // Grok exposes no login status: known on first use
}

async function version(bin) {
  const r = await quick(bin, ["--version"], 5000);
  return (/\d+\.\d+(\.\d+)?/.exec(r.out) ?? [""])[0];
}

// Absolute path of each CLI found by detect(), used to start it
const binPaths = {};

// [{ id, label, installed, loggedIn, version, path }], checked in parallel
function detect() {
  return Promise.all(Object.entries(AGENTS).map(async ([id, a]) => {
    const path_ = await which(a.bin);
    if (!path_) return { id, label: a.label, installed: false, loggedIn: false, version: "", path: "" };
    binPaths[id] = path_;
    const [loggedIn, v] = await Promise.all([loginStatus(id, path_), version(path_)]);
    return { id, label: a.label, installed: true, loggedIn, version: v, path: path_ };
  }));
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
// Codex features that give it tools of its own (verified names, codex-cli 0.164.0 `codex features list`)
const CODEX_DISABLED = [
  "shell_tool", "unified_exec", "unified_exec_tty", "shell_snapshot", "apps",
  "browser_use", "browser_use_external", "browser_use_full_cdp_access", "browser_annotation_api", "in_app_browser",
  "computer_use", "image_generation", "view_image", "plugins", "remote_plugin", "plugin_sharing",
  "multi_agent", "hooks", "skill_search", "skill_mcp_dependency_install", "tool_suggest", "sleep_tool",
];

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
  // codex: same rule as the others, it only acts through Platanus' MCP tools. Its terminal, browser,
  // computer use, plugins and subagents are switched off and the user's config is not loaded, so it
  // cannot read files (or secrets) on its own. Verified against codex-cli 0.164.0 (unknown flags fail).
  return [
    "exec", "--json", "--skip-git-repo-check", "-C", WORKDIR,
    "--ignore-user-config", "--ignore-rules", "--ephemeral",
    "-s", "read-only",
    "-c", 'approval_policy="never"',
    "-c", 'web_search="disabled"',
    ...CODEX_DISABLED.flatMap((feature) => ["--disable", feature]),
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
  const env = { ...ENV, ...opts.proxyEnv };
  const child = spawn(binPaths[id] ?? AGENTS[id].bin, argsFor(id, { ...opts, session }), { env, cwd: WORKDIR, stdio: ["ignore", "pipe", "pipe"] });
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

module.exports = { detect, login, run, proxyEnvFor };

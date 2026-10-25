// Local MCP server (Streamable HTTP, JSON responses, stateless) so the user's own agent
// (Claude Code, Cursor, Codex, Gemini CLI, or the CLIs launched from the chat) can work with Platanus.
// Only listens on 127.0.0.1 and rejects browser requests (Origin header), so a web page cannot use it.

const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const PROTOCOL_VERSION = '2025-06-18';
const MAX_BODY = 256 * 1024;

// Files and folders an agent must never read or write: secrets, private keys, credentials and git
// internals. Checked on every segment of the NORMALIZED path (so ".env/", "x/../.env" or "./.env/."
// are caught), and main.js checks the real path too (symlinks).
const BLOCKED_SEGMENT = /^(\.env(\..*)?|\.git|\.ssh|\.aws|\.gnupg|\.npmrc|\.netrc|\.pypirc|\.docker|\.htpasswd|credentials(\.json)?|secrets?\.(json|ya?ml|toml)|service[-_]?account[^/]*\.json|id_(rsa|ed25519|ecdsa|dsa)[^/]*|[^/]+\.(pem|key|p12|pfx|keystore|jks))$/i;
const ALLOWED_ENV_TEMPLATE = /^\.env\.(example|sample|template)$/i;
const MAX_READ_BYTES = 200 * 1024;

function isBlockedPath(rel) {
  const normalized = path.posix.normalize(String(rel).replace(/\\/g, '/'));
  return normalized.split('/').some((seg) => BLOCKED_SEGMENT.test(seg) && !ALLOWED_ENV_TEMPLATE.test(seg));
}

// Where an absolute path really lands inside `root` (symlinks resolved, also for a file that does not
// exist yet: its nearest existing parent is resolved), checked against the same blocklist.
async function isBlockedRealPath(root, abs) {
  let probe = abs;
  const rest = [];
  while (!fs.existsSync(probe) && path.dirname(probe) !== probe) {
    rest.unshift(path.basename(probe));
    probe = path.dirname(probe);
  }
  const real = path.join(await fs.promises.realpath(probe).catch(() => probe), ...rest);
  return isBlockedPath(path.relative(root, real).split(path.sep).join('/'));
}

const TOOLS = [
  {
    name: 'platanus_get_project',
    description: 'Returns the open project: its name and folder tree (paths only, up to 4 levels).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'platanus_list_risks',
    description: 'Lists files whose security traffic light is red (risk) or yellow (review), with the reason.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'platanus_read_file',
    description: 'Reads a text file of the project. Secrets (.env, private keys) and files over 200 KB are refused.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Path relative to the project root' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'platanus_write_file',
    description: 'Writes a text file of the project (the whole new content). The user must approve every write in a dialog, and the previous version is backed up so it can be undone. Explain the change in `reason` in plain Spanish.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the project root' },
        content: { type: 'string', description: 'Full new content of the file' },
        reason: { type: 'string', maxLength: 300, description: 'What you changed and why, in one or two plain sentences' },
      },
      required: ['path', 'content', 'reason'],
      additionalProperties: false,
    },
  },
  {
    name: 'platanus_set_file_score',
    description: "Sets a file's security traffic light on the map: green (safe), yellow (review) or red (risk), with a short reason in plain Spanish.",
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        level: { type: 'string', enum: ['green', 'yellow', 'red'] },
        reason: { type: 'string', maxLength: 240 },
      },
      required: ['path', 'level', 'reason'],
      additionalProperties: false,
    },
  },
  {
    name: 'platanus_show_folder',
    description: "Opens a folder's building on the map so the user sees what you are talking about. Use an empty path for the whole map.",
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
  // Arduino lab (spec/005-arduino-lab.md). A lab project is a folder with diagram.json (Wokwi's format),
  // lab.json (level, goal, components, steps, cautions, sources) and one .ino sketch.
  {
    name: 'platanus_arduino_parts',
    description: 'Lists the parts the Arduino lab supports (Wokwi types for diagram.json), with their pins, current and whether the emulator runs them. Use only these types.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'platanus_arduino_validate',
    description: "Checks a lab's diagram.json with the electrical rules (LED without resistor, missing ground, motors or MG996R servos on the board's 5V, pins that do not exist…) and explains each issue in Spanish.",
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Path of the diagram.json, relative to the project root' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'platanus_arduino_compile',
    description: "Compiles a sketch (.ino) with the person's arduino-cli and returns the compiler errors, summarized. board: arduino:avr:uno (default), arduino:avr:nano or arduino:avr:mega.",
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path of the .ino, relative to the project root' },
        board: { type: 'string', enum: ['arduino:avr:uno', 'arduino:avr:nano', 'arduino:avr:mega'] },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'platanus_arduino_test',
    description: "Runs a lab project in the emulator (Uno or Nano) for a few simulated seconds with the HC-SR04's obstacle at each distance, and returns what the LEDs, the buzzer and the serial monitor did. Use it to check your sketch before saying it is ready.",
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The lab folder (with diagram.json and the .ino), relative to the project root' },
        distances: { type: 'string', description: 'Obstacle distances in cm, comma separated, e.g. "10,50,150"' },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'platanus_github_repo',
    description: 'Checks a GitHub repository before you mention it: whether it exists, its description, its license (SPDX), whether it is archived or moved to another name. Never show a repository link you did not check here.',
    inputSchema: {
      type: 'object',
      properties: { owner: { type: 'string' }, repo: { type: 'string' } },
      required: ['owner', 'repo'],
      additionalProperties: false,
    },
  },
];

// Tools whose `path` is checked against the secret blocklist before anything else
const PATH_TOOLS = ['platanus_read_file', 'platanus_write_file', 'platanus_arduino_validate', 'platanus_arduino_compile', 'platanus_arduino_test'];

const text = (value, isError = false) => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
  isError,
});

// `handlers` implement the tools (they live in main.js, next to the workspace and the window).
// Every call is reported through `onCall({ tool, args, ok, error })` for the audit log.
function createMcpHandler({ handlers, onCall = () => {} }) {
  async function callTool(name, args) {
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) throw { code: -32602, message: `Unknown tool: ${name}` };
    for (const key of tool.inputSchema.required ?? []) {
      if (typeof args?.[key] !== 'string') return text(`Missing "${key}".`, true);
    }
    if (PATH_TOOLS.includes(name) && isBlockedPath(args.path)) {
      onCall({ tool: name, args, ok: false, error: 'blocked' });
      return text('Refused: this file can contain secrets and is never shared with agents.', true);
    }
    if (name === 'platanus_set_file_score' && !['green', 'yellow', 'red'].includes(args.level)) {
      return text('level must be green, yellow or red.', true);
    }
    try {
      const result = await handlers[name](args ?? {});
      onCall({ tool: name, args, ok: true });
      return text(result);
    } catch (err) {
      onCall({ tool: name, args, ok: false, error: err.message });
      return text(err.message, true);
    }
  }

  async function handle(msg) {
    switch (msg.method) {
      case 'initialize':
        return {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'platanus', version: '0.1.0' },
          instructions:
            'Platanus shows a project as an isometric map with a security traffic light per file. Explain risks in plain Spanish for non-developers. For Arduino projects, use the platanus_arduino_* tools: validate, compile and test before saying a project is ready, and check every repository with platanus_github_repo before mentioning it.',
        };
      case 'ping':
        return {};
      case 'tools/list':
        return { tools: TOOLS };
      case 'tools/call':
        return callTool(String(msg.params?.name ?? ''), msg.params?.arguments ?? {});
      default:
        throw { code: -32601, message: `Method not found: ${msg.method}` };
    }
  }

  // JSON-RPC message or batch -> reply (null for notifications only)
  return async function respond(body) {
    const batch = Array.isArray(body) ? body : [body];
    const replies = [];
    for (const m of batch) {
      if (m?.id === undefined || m?.id === null) continue; // notifications
      try {
        replies.push({ jsonrpc: '2.0', id: m.id, result: await handle(m) });
      } catch (e) {
        replies.push({ jsonrpc: '2.0', id: m.id, error: { code: e.code ?? -32603, message: e.message ?? 'Internal error' } });
      }
    }
    if (!replies.length) return null;
    return Array.isArray(body) ? replies : replies[0];
  };
}

// Only local, non-browser clients: the Host must be 127.0.0.1/localhost (DNS rebinding) and there
// must be no Origin header (browsers always send one on cross-origin requests).
function isAllowedRequest(req, port) {
  const host = String(req.headers.host ?? '');
  const okHost = host === `127.0.0.1:${port}` || host === `localhost:${port}`;
  return okHost && !req.headers.origin;
}

// `token`: private key in the address (/mcp/<token>), so other programs or users on this computer
// cannot use the server. Compared in constant time.
function startMcpServer({ port = 7811, handlers, onCall, token }) {
  const respond = createMcpHandler({ handlers, onCall });
  const expected = Buffer.from(`/mcp/${token ?? ''}`);
  const isOurPath = (url) => {
    const got = Buffer.from(String(url));
    return Boolean(token) && got.length === expected.length && crypto.timingSafeEqual(got, expected);
  };
  const server = http.createServer((req, res) => {
    const actualPort = server.address()?.port;
    if (!isAllowedRequest(req, actualPort)) {
      res.writeHead(403).end();
      return;
    }
    if (!isOurPath(req.url)) return void res.writeHead(404).end();
    if (req.method === 'GET') return void res.writeHead(405, { Allow: 'POST' }).end(); // no server stream
    if (req.method !== 'POST') return void res.writeHead(405).end();

    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) req.destroy();
      else chunks.push(c);
    });
    req.on('end', async () => {
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return void res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
      }
      const reply = await respond(body);
      if (!reply) return void res.writeHead(202).end();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(reply));
    });
  });

  return new Promise((resolve) => {
    // If the port is taken (another Platanus window, another app), let the OS pick a free one
    server.once('error', () => server.listen(0, '127.0.0.1', () => resolve(server)));
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

module.exports = { TOOLS, createMcpHandler, startMcpServer, isBlockedPath, isBlockedRealPath, isAllowedRequest, MAX_READ_BYTES };

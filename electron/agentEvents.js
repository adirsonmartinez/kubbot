// Turns one output line of an agent CLI into simple events for the chat. Pure (no I/O), so it is tested
// on its own (agentEvents.test.js). Formats: Claude Code and Grok Build "stream JSON" (system /
// assistant / user / result) and Codex "exec --json" JSONL items.
//
// Events:
//   { type: 'session', id }                       conversation id (to continue it later)
//   { type: 'text' | 'thinking', delta, parent }  answer / reasoning; parent = subagent id or null
//   { type: 'tool', id, name, target, parent }    a Platanus tool starts (name without prefix)
//   { type: 'tool_done', id, error }              that tool (or subagent) finished
//   { type: 'subagent', id, description, kind, parent }  the agent launched a helper agent
//   { type: 'result', durationMs, turns, inputTokens, outputTokens }
//   { type: 'error', message }
//
// Only Platanus tools and subagents are reported: the CLIs' own tools are disabled anyway.

const PLATANUS = /^(?:mcp__)?platanus(?:__|\.|_|:)(?:platanus_)?(.+)$/;
const SUBAGENT_TOOLS = new Set(['Task', 'Agent', 'spawn_subagent']);

const toolName = (raw) => {
  const m = PLATANUS.exec(String(raw ?? ''));
  return m ? m[1] : null;
};
// What the tool works on (shown next to its name): a path when there is one
const targetOf = (input) => String(input?.path ?? input?.arguments?.path ?? '').slice(0, 160);

function fromStream(e) {
  const out = [];
  const parent = e.parent_tool_use_id ?? null;
  if (e.type === 'system' && e.session_id) out.push({ type: 'session', id: e.session_id });
  if (e.type === 'assistant') {
    for (const b of e.message?.content ?? []) {
      if (b.type === 'thinking' && b.thinking) out.push({ type: 'thinking', delta: b.thinking, parent });
      if (b.type === 'text' && b.text) out.push({ type: 'text', delta: b.text, parent });
      if (b.type !== 'tool_use') continue;
      if (SUBAGENT_TOOLS.has(b.name)) {
        out.push({ type: 'subagent', id: b.id, description: String(b.input?.description ?? b.input?.prompt ?? '').slice(0, 160), kind: String(b.input?.subagent_type ?? ''), parent });
        continue;
      }
      // Grok wraps MCP tools in use_tool { tool_name: "platanus__x", arguments }
      const raw = b.name === 'use_tool' ? b.input?.tool_name : b.name;
      const input = b.name === 'use_tool' ? b.input?.arguments ?? b.input : b.input;
      const name = toolName(raw);
      if (name) out.push({ type: 'tool', id: b.id, name, target: targetOf(input), parent });
    }
  }
  if (e.type === 'user') {
    for (const b of e.message?.content ?? []) {
      if (b.type === 'tool_result') out.push({ type: 'tool_done', id: b.tool_use_id, error: Boolean(b.is_error) });
    }
  }
  if (e.type === 'result') {
    const u = e.usage ?? {};
    if (!e.is_error) {
      out.push({
        type: 'result',
        durationMs: Number(e.duration_ms) || 0,
        turns: Number(e.num_turns) || 0,
        inputTokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
        outputTokens: u.output_tokens ?? 0,
      });
    } else {
      out.push({ type: 'error', message: String(e.result || e.error || '') });
    }
  }
  return out;
}

function fromCodex(e) {
  const item = e.item ?? e.msg;
  if (!item) return [];
  if (item.type === 'reasoning' && (item.text || item.summary)) return [{ type: 'thinking', delta: String(item.text || item.summary), parent: null }];
  if ((item.type === 'agent_message' || item.type === 'assistant_message') && (item.text || item.message)) {
    return [{ type: 'text', delta: String(item.text || item.message), parent: null }];
  }
  if (item.type === 'mcp_tool_call') {
    if (e.type === 'item.completed') return [{ type: 'tool_done', id: item.id, error: item.status === 'failed' || Boolean(item.error) }];
    const name = toolName(`platanus__${String(item.tool || item.name || '')}`);
    return name ? [{ type: 'tool', id: item.id, name, target: targetOf(item.arguments), parent: null }] : [];
  }
  if (item.type === 'error') return [{ type: 'error', message: String(item.message || '') }];
  return [];
}

function parseAgentLine(agent, line) {
  let e;
  try {
    e = JSON.parse(line);
  } catch {
    return [];
  }
  if (!e || typeof e !== 'object') return [];
  return agent === 'codex' ? fromCodex(e) : fromStream(e);
}

module.exports = { parseAgentLine };

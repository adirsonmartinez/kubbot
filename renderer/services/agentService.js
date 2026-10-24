// Access to the user's own agent and the local MCP server. Inside Electron it goes through
// window.platanus (preload); in a plain browser nothing is available (agents need the desktop app).
export function createAgentService(bridge = window.platanus) {
  if (!bridge?.agents) {
    return {
      isDesktop: false,
      detect: async () => ({ ok: true, data: [] }),
      login: async () => ({ ok: false }),
      run: async () => ({ ok: false, error: 'desktop-only' }),
      onEvent: () => () => {},
      mcpInfo: async () => ({ ok: true, data: { url: null, running: false } }),
      onMcpStatus: () => () => {},
      onMcpRequest: () => () => {},
      replyMcp: async () => {},
      onScore: () => () => {},
    };
  }
  return {
    isDesktop: true,
    detect: () => bridge.agents.detect(),
    login: (id) => bridge.agents.login(id),
    run: (req) => bridge.agents.run(req),
    onEvent: (cb) => bridge.agents.onEvent(cb),
    mcpInfo: () => bridge.mcp.info(),
    onMcpStatus: (cb) => bridge.mcp.onStatus(cb),
    onMcpRequest: (cb) => bridge.mcp.onRequest(cb),
    replyMcp: (payload) => bridge.mcp.reply(payload),
    onScore: (cb) => bridge.mcp.onScore(cb),
  };
}

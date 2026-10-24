const test = require('node:test');
const assert = require('node:assert/strict');
const { proxyEnvFor } = require('./agents');

const LOCAL = '127.0.0.1,localhost,::1';

test('the system proxy (e.g. a VPN like Psiphon) is handed to the CLI, never for the local MCP server', () => {
  assert.deepEqual(proxyEnvFor('PROXY 127.0.0.1:59510', {}), {
    HTTPS_PROXY: 'http://127.0.0.1:59510', HTTP_PROXY: 'http://127.0.0.1:59510', NO_PROXY: LOCAL,
  });
});

test('the first HTTP proxy of a list is used; SOCKS-only or DIRECT means no proxy', () => {
  assert.equal(proxyEnvFor('SOCKS5 127.0.0.1:1080; PROXY proxy.corp:8080; DIRECT', {}).HTTPS_PROXY, 'http://proxy.corp:8080');
  assert.deepEqual(proxyEnvFor('SOCKS5 127.0.0.1:1080', {}), {});
  assert.deepEqual(proxyEnvFor('DIRECT', {}), {});
  assert.deepEqual(proxyEnvFor('', {}), {});
});

test('a proxy the person set in the environment wins over the system one', () => {
  assert.deepEqual(proxyEnvFor('PROXY 127.0.0.1:59510', { HTTPS_PROXY: 'http://mine:3128' }), {});
  assert.deepEqual(proxyEnvFor('PROXY 127.0.0.1:59510', { https_proxy: 'http://mine:3128' }), {});
});

test('anything that is not a plain host:port is ignored', () => {
  assert.deepEqual(proxyEnvFor('PROXY evil host:1;rm', {}), {});
  assert.deepEqual(proxyEnvFor('PROXY host:99999999', {}), {});
});

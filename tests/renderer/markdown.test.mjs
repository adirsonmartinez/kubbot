import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownToHtml } from '../../renderer/views/ui/markdown.js';

test('bold, italics, inline code and paragraphs', () => {
  const html = markdownToHtml('Revisé **team-12** y *todo* va bien.\n\nUsa `npm test`.');
  assert.equal(html, '<p>Revisé <strong>team-12</strong> y <em>todo</em> va bien.</p><p>Usa <code>npm test</code>.</p>');
});

test('lists and headings become structure', () => {
  const html = markdownToHtml('## Qué encontré\n- **a.js** (rojo)\n- b.js\n\n1. Primero\n2. Segundo');
  assert.equal(html, '<h4>Qué encontré</h4><ul><li><strong>a.js</strong> (rojo)</li><li>b.js</li></ul><ol><li>Primero</li><li>Segundo</li></ol>');
});

test('a bold line followed by a list keeps both', () => {
  const html = markdownToHtml('**Ya revisados:**\n- uno');
  assert.equal(html, '<p><strong>Ya revisados:</strong></p><ul><li>uno</li></ul>');
});

test('code blocks keep their text verbatim', () => {
  const html = markdownToHtml('```sql\nALTER TABLE users ENABLE ROW LEVEL SECURITY;\n```');
  assert.equal(html, '<pre><code>ALTER TABLE users ENABLE ROW LEVEL SECURITY;</code></pre>');
});

test('HTML from the agent or the project is escaped, never executed', () => {
  const html = markdownToHtml('<img src=x onerror=alert(1)> **<b>x</b>** [a](javascript:alert(1))');
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<b>'));
  assert.ok(!html.includes('href'));
  assert.ok(html.includes('&lt;img'));
});

test('unclosed markers while streaming stay as text', () => {
  assert.equal(markdownToHtml('Revisé **team'), '<p>Revisé **team</p>');
});

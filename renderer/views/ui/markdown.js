// Small, safe Markdown for the agent's answers: headings, paragraphs, lists, bold, italics, inline code
// and code blocks. Everything is escaped first, so HTML in an answer (or in a file name it quotes) is
// shown as text, never run. Links are shown as plain text (no href). Unclosed markers stay as written,
// which keeps a streaming answer readable while it arrives.
import { escapeHtml } from '../../core/format.js';

function inline(text) {
  return escapeHtml(text)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, '$1');
}

export function markdownToHtml(source) {
  const lines = String(source ?? '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let paragraph = [];
  let list = null; // { tag: 'ul' | 'ol', items: [] }
  let code = null; // lines of an open code block

  const flushParagraph = () => {
    if (paragraph.length) out.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };

  for (const line of lines) {
    if (code) {
      if (/^```/.test(line.trim())) { out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); code = null; }
      else code.push(line);
      continue;
    }
    if (/^```/.test(line.trim())) { flushParagraph(); flushList(); code = []; continue; }
    const heading = /^#{1,6}\s+(.+)$/.exec(line.trim());
    const bullet = /^\s*[-*•]\s+(.+)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (heading) { flushParagraph(); flushList(); out.push(`<h4>${inline(heading[1])}</h4>`); continue; }
    if (bullet || numbered) {
      flushParagraph();
      const tag = bullet ? 'ul' : 'ol';
      if (list?.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push((bullet ?? numbered)[1]);
      continue;
    }
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    flushList();
    paragraph.push(line.trim());
  }
  if (code) out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); // still streaming
  flushParagraph();
  flushList();
  return out.join('');
}

// Small, safe Markdown for Qubi's answers: paragraphs, headings, lists, bold, italics, inline code, code
// blocks and quotes. It returns a tree (never HTML), so the view builds elements itself and nothing in an
// answer can run: tags show as text and links show only their words. Unclosed markers stay as written.

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "code"; text: string };

export type Block =
  | { type: "paragraph"; lines: Inline[][] } // one entry per line (a line break inside a paragraph)
  | { type: "heading"; children: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "code"; text: string }
  | { type: "quote"; blocks: Block[] };

// Hostile or runaway text must stay cheap: a quote inside a quote goes at most MAX_DEPTH deep, the text is cut
// at MAX_CHARS, and a link label is short (an unclosed "[" cannot make the regex rescan the whole text)
export const MARKDOWN_LIMITS = { depth: 6, chars: 20_000, label: 200 } as const;
const LINK = /\[([^\]\n]{1,200})\]\(([^\s]{1,500})\)/g;
const SPANS: { type: "code" | "strong" | "em"; re: RegExp }[] = [
  { type: "code", re: /`([^`\n]+)`/ },
  { type: "strong", re: /\*\*([^*\n]+?)\*\*/ },
  { type: "em", re: /(?<![*\w])\*(?=\S)([^*\n]*?\S)\*(?![*\w])/ },
];

// "[words](address)" -> "words": the address is never kept
const unlink = (text: string) => text.replace(LINK, "$1");

export function parseInline(source: string): Inline[] {
  const text = unlink(source);
  const out: Inline[] = [];
  let rest = text;
  while (rest) {
    let best: { type: "code" | "strong" | "em"; index: number; length: number; inner: string } | null = null;
    for (const { type, re } of SPANS) {
      const m = re.exec(rest);
      if (m && (best === null || m.index < best.index)) best = { type, index: m.index, length: m[0].length, inner: m[1] };
    }
    if (!best) {
      out.push({ type: "text", text: rest });
      break;
    }
    if (best.index > 0) out.push({ type: "text", text: rest.slice(0, best.index) });
    out.push(best.type === "code" ? { type: "code", text: best.inner } : { type: best.type, children: parseInline(best.inner) });
    rest = rest.slice(best.index + best.length);
  }
  return out;
}

export function parseMarkdown(source: string, depth = 0): Block[] {
  const lines = String(source ?? "").slice(0, MARKDOWN_LIMITS.chars).replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let code: string[] | null = null;
  let quote: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", lines: paragraph.map(parseInline) });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ type: "list", ordered: list.ordered, items: list.items.map(parseInline) });
    list = null;
  };
  const flushQuote = () => {
    if (quote) blocks.push({ type: "quote", blocks: parseMarkdown(quote.join("\n"), depth + 1) });
    quote = null;
  };

  for (const line of lines) {
    if (code) {
      if (/^```/.test(line.trim())) {
        blocks.push({ type: "code", text: code.join("\n") });
        code = null;
      } else code.push(line);
      continue;
    }
    // Past the depth limit a ">" is plain text
    const quoted = depth < MARKDOWN_LIMITS.depth ? /^\s*>\s?(.*)$/.exec(line) : null;
    if (quoted) {
      flushParagraph();
      flushList();
      (quote ??= []).push(quoted[1]);
      continue;
    }
    flushQuote();
    if (/^```/.test(line.trim())) {
      flushParagraph();
      flushList();
      code = [];
      continue;
    }
    const heading = /^#{1,6}\s+(.+)$/.exec(line.trim());
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", children: parseInline(heading[1]) });
      continue;
    }
    const bullet = /^\s*[-*•]\s+(.+)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = !bullet;
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  if (code) blocks.push({ type: "code", text: (code as string[]).join("\n") }); // still open
  flushQuote();
  flushParagraph();
  flushList();
  return blocks;
}

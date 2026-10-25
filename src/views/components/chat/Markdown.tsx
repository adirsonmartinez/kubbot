// Qubi's answer as formatted text. The tree comes from the view model (parseMarkdown), so nothing here
// writes HTML: whatever the model sends is shown as text.

import type { ReactNode } from "react";
import { parseMarkdown, type Block, type Inline } from "@/viewmodels/useChatViewModel";

function inline(nodes: Inline[]): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.type) {
      case "text":
        return n.text;
      case "strong":
        return <strong key={i}>{inline(n.children)}</strong>;
      case "em":
        return <em key={i}>{inline(n.children)}</em>;
      case "code":
        return <code key={i}>{n.text}</code>;
    }
  });
}

function blocks(list: Block[]): ReactNode[] {
  return list.map((b, i) => {
    switch (b.type) {
      case "paragraph":
        return (
          <p key={i}>
            {b.lines.map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {inline(line)}
              </span>
            ))}
          </p>
        );
      case "heading":
        return <h4 key={i}>{inline(b.children)}</h4>;
      case "list": {
        const Tag = b.ordered ? "ol" : "ul";
        return (
          <Tag key={i}>
            {b.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </Tag>
        );
      }
      case "code":
        return (
          <pre key={i}>
            <code>{b.text}</code>
          </pre>
        );
      case "quote":
        return <blockquote key={i}>{blocks(b.blocks)}</blockquote>;
    }
  });
}

export function Markdown({ text }: { text: string }) {
  return <div className="md">{blocks(parseMarkdown(text))}</div>;
}

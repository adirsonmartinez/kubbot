import assert from "node:assert/strict";
import { test } from "node:test";
import { parseInline, parseMarkdown } from "../src/models/markdown.ts";

test("bold, italics and code inside a line", () => {
  assert.deepEqual(parseInline("Pon el **sensor** y *luego* `D3`."), [
    { type: "text", text: "Pon el " },
    { type: "strong", children: [{ type: "text", text: "sensor" }] },
    { type: "text", text: " y " },
    { type: "em", children: [{ type: "text", text: "luego" }] },
    { type: "text", text: " " },
    { type: "code", text: "D3" },
    { type: "text", text: "." },
  ]);
});

test("unclosed markers stay as written", () => {
  assert.deepEqual(parseInline("a **b"), [{ type: "text", text: "a **b" }]);
  assert.deepEqual(parseInline("2 * 3 * 4"), [{ type: "text", text: "2 * 3 * 4" }]);
});

test("links keep only their words, and tags stay text", () => {
  assert.deepEqual(parseInline("[mira](javascript:alert(1))"), [{ type: "text", text: "mira" }]);
  const tags = parseInline("<img src=x onerror=alert(1)>");
  assert.deepEqual(tags, [{ type: "text", text: "<img src=x onerror=alert(1)>" }]);
});

test("paragraphs, headings, lists and code blocks", () => {
  const blocks = parseMarkdown("## Plan\nHola\ncómo vas\n\n- uno\n- dos\n\n1. a\n2) b\n\n```\nint x;\n```");
  assert.equal(blocks[0].type, "heading");
  assert.equal(blocks[1].type, "paragraph");
  assert.equal((blocks[1] as { lines: unknown[] }).lines.length, 2);
  assert.deepEqual(blocks[2], { type: "list", ordered: false, items: [[{ type: "text", text: "uno" }], [{ type: "text", text: "dos" }]] });
  assert.equal((blocks[3] as { ordered: boolean }).ordered, true);
  assert.deepEqual(blocks[4], { type: "code", text: "int x;" });
});

test("quotes hold blocks and an open code block is kept", () => {
  const blocks = parseMarkdown("> nota\n> otra\n\n```\nabierto");
  assert.equal(blocks[0].type, "quote");
  assert.deepEqual(blocks[1], { type: "code", text: "abierto" });
  assert.deepEqual(parseMarkdown(""), []);
});

import { Fragment, type ReactNode } from "react";

type Token =
  | { kind: "text"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "key"; value: string };

const PATTERN = /\[\[([^\[\]]+?)\]\]|\*\*([^*]+?)\*\*/g;

function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  PATTERN.lastIndex = 0;
  while ((m = PATTERN.exec(line)) !== null) {
    if (m.index > lastIndex) {
      tokens.push({ kind: "text", value: line.slice(lastIndex, m.index) });
    }
    if (m[1] !== undefined) {
      tokens.push({ kind: "key", value: m[1] });
    } else if (m[2] !== undefined) {
      tokens.push({ kind: "bold", value: m[2] });
    }
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < line.length) {
    tokens.push({ kind: "text", value: line.slice(lastIndex) });
  }
  return tokens;
}

function renderTokens(tokens: Token[]): ReactNode {
  return tokens.map((t, i) => {
    switch (t.kind) {
      case "text":
        return <Fragment key={i}>{t.value}</Fragment>;
      case "bold":
        return (
          <strong key={i} className="font-semibold text-foreground">
            {t.value}
          </strong>
        );
      case "key":
        return (
          <strong
            key={i}
            className="text-blue-600 dark:text-blue-400 font-bold text-base"
          >
            {t.value}
          </strong>
        );
    }
  });
}

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let buffer: Block | null = null;

  const flush = () => {
    if (buffer) {
      blocks.push(buffer);
      buffer = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (trimmed === "") {
      flush();
      continue;
    }

    const ulMatch = /^\s*[-•*]\s+(.*)$/.exec(line);
    const olMatch = /^\s*\d+[.)]\s+(.*)$/.exec(line);

    if (ulMatch) {
      if (!buffer || buffer.kind !== "ul") {
        flush();
        buffer = { kind: "ul", items: [] };
      }
      buffer.items.push(ulMatch[1] ?? "");
    } else if (olMatch) {
      if (!buffer || buffer.kind !== "ol") {
        flush();
        buffer = { kind: "ol", items: [] };
      }
      buffer.items.push(olMatch[1] ?? "");
    } else {
      if (!buffer || buffer.kind !== "p") {
        flush();
        buffer = { kind: "p", lines: [] };
      }
      buffer.lines.push(line);
    }
  }
  flush();
  return blocks;
}

export function RichAnswer({ text }: { text: string }) {
  const blocks = parseBlocks(text ?? "");
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {blocks.map((block, i) => {
        if (block.kind === "p") {
          return (
            <p key={i} className="whitespace-pre-line">
              {block.lines.map((line, li) => (
                <Fragment key={li}>
                  {li > 0 && <br />}
                  {renderTokens(tokenize(line))}
                </Fragment>
              ))}
            </p>
          );
        }
        if (block.kind === "ul") {
          return (
            <ul
              key={i}
              className="list-disc pr-5 space-y-1 marker:text-muted-foreground"
            >
              {block.items.map((it, ii) => (
                <li key={ii}>{renderTokens(tokenize(it))}</li>
              ))}
            </ul>
          );
        }
        return (
          <ol
            key={i}
            className="list-decimal pr-5 space-y-1 marker:text-muted-foreground"
          >
            {block.items.map((it, ii) => (
              <li key={ii}>{renderTokens(tokenize(it))}</li>
            ))}
          </ol>
        );
      })}
    </div>
  );
}

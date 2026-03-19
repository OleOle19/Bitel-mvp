const fs = require("fs");
const path = require("path");

function escapeHtml(input) {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(text) {
  let out = escapeHtml(text);

  // Inline code: `...`
  out = out.replace(/`([^`]+)`/g, (_m, code) => `<code>${escapeHtml(code)}</code>`);

  // Links: [text](url)
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m, label, url) => `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`
  );

  // Bold: **text**
  out = out.replace(/\*\*([^*]+)\*\*/g, (_m, b) => `<strong>${escapeHtml(b)}</strong>`);

  return out;
}

function isTableSeparatorLine(line) {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  // Accept: |---|---:|:---| etc.
  const cells = trimmed
    .split("|")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-{3,}:?$/.test(c));
}

function splitTableRow(line) {
  // Keep it simple: split by |, trim, ignore empty edges
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function renderTable(lines, startIndex) {
  const header = splitTableRow(lines[startIndex]);
  const alignRow = splitTableRow(lines[startIndex + 1]);
  const aligns = alignRow.map((c) => {
    const left = c.startsWith(":");
    const right = c.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    return "left";
  });

  let i = startIndex + 2;
  const rows = [];
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || !line.includes("|")) break;
    if (isTableSeparatorLine(line)) break;
    rows.push(splitTableRow(line));
    i += 1;
  }

  const ths = header
    .map((cell, idx) => {
      const align = aligns[idx] || "left";
      return `<th style="text-align:${align}">${renderInline(cell)}</th>`;
    })
    .join("");

  const trs = rows
    .map((row) => {
      const tds = header
        .map((_h, idx) => {
          const align = aligns[idx] || "left";
          const cell = row[idx] ?? "";
          return `<td style="text-align:${align}">${renderInline(cell)}</td>`;
        })
        .join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");

  return {
    html: `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`,
    nextIndex: i
  };
}

function renderCodeBlock(lang, content) {
  const languageClass = lang ? ` language-${escapeHtml(lang)}` : "";
  return `<pre><code class="${languageClass.trim()}">${escapeHtml(content)}</code></pre>`;
}

function detectListType(line) {
  if (/^\s*-\s+\[( |x|X)\]\s+/.test(line)) return "check";
  if (/^\s*[-*]\s+/.test(line)) return "ul";
  if (/^\s*\d+[.)]\s+/.test(line)) return "ol";
  return null;
}

function renderList(lines, startIndex) {
  const type = detectListType(lines[startIndex]);
  if (!type) return null;

  const items = [];
  let i = startIndex;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) break;
    const thisType = detectListType(line);
    if (thisType !== type) break;

    if (type === "check") {
      const m = line.match(/^\s*-\s+\[( |x|X)\]\s+(.*)$/);
      const checked = m && /[xX]/.test(m[1]);
      const text = m ? m[2] : line;
      items.push({ checked, text });
    } else if (type === "ul") {
      items.push({ text: line.replace(/^\s*[-*]\s+/, "") });
    } else {
      items.push({ text: line.replace(/^\s*\d+[.)]\s+/, "") });
    }
    i += 1;
  }

  if (type === "check") {
    const lis = items
      .map(
        (it) =>
          `<li class="check-item"><span class="box${
            it.checked ? " checked" : ""
          }"></span><span>${renderInline(it.text)}</span></li>`
      )
      .join("");
    return { html: `<ul class="checklist">${lis}</ul>`, nextIndex: i };
  }

  const tag = type === "ol" ? "ol" : "ul";
  const lis = items.map((it) => `<li>${renderInline(it.text)}</li>`).join("");
  return { html: `<${tag}>${lis}</${tag}>`, nextIndex: i };
}

function renderBlockquote(lines, startIndex) {
  let i = startIndex;
  const collected = [];
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim().startsWith(">")) break;
    collected.push(line.replace(/^\s*>\s?/, ""));
    i += 1;
  }
  const text = collected.join("\n").trim();
  const paragraphs = text
    .split(/\n{2,}/g)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter(Boolean)
    .map((p) => `<p>${renderInline(p)}</p>`)
    .join("");
  return { html: `<blockquote class="callout">${paragraphs}</blockquote>`, nextIndex: i };
}

function renderMarkdownToHtml(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const chunks = [];
  let i = 0;

  const flushParagraph = (buffer) => {
    const text = buffer.join(" ").replace(/\s+/g, " ").trim();
    if (text) chunks.push(`<p>${renderInline(text)}</p>`);
    buffer.length = 0;
  };

  const paragraph = [];
  while (i < lines.length) {
    const line = lines[i];

    // Code fence
    const fenceMatch = line.match(/^```(\w+)?\s*$/);
    if (fenceMatch) {
      flushParagraph(paragraph);
      const lang = fenceMatch[1] || "";
      i += 1;
      const contentLines = [];
      while (i < lines.length && !lines[i].startsWith("```")) {
        contentLines.push(lines[i]);
        i += 1;
      }
      // Skip closing fence
      if (i < lines.length && lines[i].startsWith("```")) i += 1;
      chunks.push(renderCodeBlock(lang, contentLines.join("\n")));
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph(paragraph);
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      chunks.push(`<h${level}>${renderInline(text)}</h${level}>`);
      i += 1;
      continue;
    }

    // Blockquote
    if (line.trim().startsWith(">")) {
      flushParagraph(paragraph);
      const block = renderBlockquote(lines, i);
      chunks.push(block.html);
      i = block.nextIndex;
      continue;
    }

    // Table
    if (line.includes("|") && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1])) {
      flushParagraph(paragraph);
      const table = renderTable(lines, i);
      chunks.push(table.html);
      i = table.nextIndex;
      continue;
    }

    // List
    const listType = detectListType(line);
    if (listType) {
      flushParagraph(paragraph);
      const list = renderList(lines, i);
      if (list) {
        chunks.push(list.html);
        i = list.nextIndex;
        continue;
      }
    }

    // Blank line
    if (!line.trim()) {
      flushParagraph(paragraph);
      i += 1;
      continue;
    }

    // Default: paragraph
    paragraph.push(line.trim());
    i += 1;
  }
  flushParagraph(paragraph);

  return chunks.join("\n");
}

function buildDocument(bodyHtml, options) {
  const { title, subtitle, generatedAt } = options;
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root{
        --bg:#ffffff;
        --text:#111827;
        --muted:#374151;
        --border:#e5e7eb;
        --header:#0f172a;
        --headerText:#ffffff;
        --codeBg:#f3f4f6;
        --calloutBg:#eff6ff;
        --calloutBorder:#93c5fd;
        --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial;
        --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      }
      *{box-sizing:border-box}
      body{margin:0;font-family:var(--sans);color:var(--text);background:var(--bg);line-height:1.55}
      .wrap{max-width:920px;margin:0 auto;padding:34px 18px 60px}
      header{
        border:1px solid var(--border);
        border-radius:14px;
        padding:18px 18px 14px;
        background:linear-gradient(180deg, #0f172a, #111827);
        color:var(--headerText);
      }
      header h1{margin:0 0 6px;font-size:26px;letter-spacing:-.01em}
      header p{margin:0;color:rgba(255,255,255,.85);font-size:13px}
      header .meta{margin-top:10px;color:rgba(255,255,255,.72);font-size:12px}
      main{margin-top:18px}
      h1,h2,h3,h4,h5,h6{color:#0f172a;letter-spacing:-.01em}
      h2{margin:22px 0 10px;padding-top:6px;border-top:1px solid var(--border)}
      h3{margin:16px 0 8px}
      p{margin:10px 0;color:var(--muted)}
      a{color:#2563eb;text-decoration:none}
      a:hover{text-decoration:underline}
      code{
        font-family:var(--mono);
        font-size:12px;
        background:var(--codeBg);
        border:1px solid var(--border);
        padding:1px 6px;
        border-radius:10px;
      }
      pre{
        background:var(--codeBg);
        border:1px solid var(--border);
        border-radius:12px;
        padding:12px;
        overflow:auto;
      }
      pre code{border:none;padding:0;background:transparent}
      table{
        width:100%;
        border-collapse:separate;
        border-spacing:0;
        border:1px solid var(--border);
        border-radius:12px;
        overflow:hidden;
        margin:12px 0;
      }
      th,td{
        padding:9px 10px;
        border-bottom:1px solid var(--border);
        vertical-align:top;
      }
      th{
        background:#f9fafb;
        font-size:12px;
        color:#111827;
        text-transform:none;
      }
      tr:last-child td{border-bottom:none}
      ul,ol{margin:10px 0;padding-left:18px;color:var(--muted)}
      li{margin:6px 0}
      blockquote.callout{
        margin:12px 0;
        padding:12px 14px;
        border-radius:12px;
        background:var(--calloutBg);
        border:1px solid var(--calloutBorder);
      }
      blockquote.callout p{margin:6px 0;color:#0f172a}
      ul.checklist{list-style:none;padding-left:0;margin-left:0}
      ul.checklist li.check-item{
        display:flex;
        gap:10px;
        align-items:flex-start;
        padding:7px 10px;
        border:1px solid var(--border);
        border-radius:10px;
        margin:8px 0;
        background:#ffffff;
      }
      .box{
        width:14px;height:14px;border:1px solid #9ca3af;border-radius:4px;margin-top:3px;flex:0 0 14px;
      }
      .box.checked{background:#111827}
      @page{size:A4;margin:14mm}
      @media print{a{color:#111827;text-decoration:none}}
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(subtitle)}</p>
        <div class="meta">Generado: ${escapeHtml(generatedAt)}</div>
      </header>
      <main>
${bodyHtml}
      </main>
    </div>
  </body>
</html>`;
}

function findFirstHeading(mdRaw) {
  const lines = String(mdRaw || "").replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    const match = line.match(/^#\s+(.+)\s*$/);
    if (match) return match[1].trim();
  }
  return null;
}

function main() {
  const args = process.argv.slice(2);
  const mdPath = args[0] || path.join("docs", "DEMO_MEET.md");
  const outHtmlPath = args[1] || path.join("docs", "DEMO_MEET.from-md.html");
  const titleArg = args[2];
  const subtitleArg = args[3];

  const mdRaw = fs.readFileSync(mdPath, "utf8");
  const body = renderMarkdownToHtml(mdRaw);
  const now = new Date();
  const generatedAt = now.toISOString().replace("T", " ").slice(0, 16);

  const defaultTitle =
    titleArg ||
    findFirstHeading(mdRaw) ||
    (path.basename(mdPath).toUpperCase() === "DEMO_MEET.MD"
      ? "Guion de demostración (Google Meet)"
      : path.basename(mdPath));
  const defaultSubtitle =
    subtitleArg || `Exportado desde ${mdPath} (tablas y cuadros estilizados).`;
  const doc = buildDocument(body, {
    title: defaultTitle,
    subtitle: defaultSubtitle,
    generatedAt
  });

  fs.writeFileSync(outHtmlPath, doc, "utf8");
  // eslint-disable-next-line no-console
  console.log(`OK: ${outHtmlPath}`);
}

main();

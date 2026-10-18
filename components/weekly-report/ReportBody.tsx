import { Fragment, ReactNode } from "react";

// A deliberately small Markdown renderer: report text is never inserted as HTML.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

export function ReportBody({ markdown }: { markdown: string }) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line || /^[-*_]{3,}$/.test(line)) { i++; continue; }
    const key = i;
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) { blocks.push(<h2 key={key}>{inline(heading[1])}</h2>); i++; continue; }
    if (line.includes("|") && i + 1 < lines.length && /^\|?\s*:?-{3,}/.test(lines[i + 1].trim())) {
      const headers = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(cells(lines[i++]));
      blocks.push(<div className="weekly-table" key={key} tabIndex={0} role="region" aria-label="주요 매크로 지표 표"><table>
        <thead><tr>{headers.map((cell, col) => <th scope="col" key={col}>{inline(cell)}</th>)}</tr></thead>
        <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, col) => <td key={col}>{inline(row[col] ?? "")}</td>)}</tr>)}</tbody>
      </table></div>);
      continue;
    }
    if (/^[-*•]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        items.push(<li key={i}>{inline(lines[i++].trim().replace(/^[-*•]\s+/, ""))}</li>);
      }
      blocks.push(<ul key={key}>{items}</ul>);
      continue;
    }
    const paragraph: string[] = [lines[i++]];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|[-*•]\s)/.test(lines[i].trim()) && !lines[i].includes("|")) paragraph.push(lines[i++]);
    blocks.push(<p key={key}>{paragraph.map((text, idx) => <Fragment key={idx}>{idx ? <br /> : null}{inline(text)}</Fragment>)}</p>);
  }
  return <div className="weekly-body">{blocks}</div>;
}

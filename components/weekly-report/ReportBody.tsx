import { Fragment, ReactNode } from "react";

// A deliberately small Markdown renderer: report text is never inserted as HTML.
function inline(text: string, renderText: (value: string) => ReactNode = (value) => value): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{renderText(part.slice(2, -2))}</strong>;
    }
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer">{renderText(link[1])}</a>;
    return <Fragment key={index}>{renderText(part)}</Fragment>;
  });
}

function marketChangeText(text: string): ReactNode[] {
  return text.split(/([+−-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*(?:%|bps?\b))/gi).map((part, index) => {
    const match = part.match(/^([+−-]?[\d,]+(?:\.\d+)?)\s*(?:%|bps?)$/i);
    const value = match ? Number(match[1].replace(/,/g, "").replace(/−/g, "-")) : 0;
    const direction = value > 0 ? "positive" : value < 0 ? "negative" : undefined;
    return direction ? <span key={index} className={`weekly-market-${direction}`}>{part}</span> : <Fragment key={index}>{part}</Fragment>;
  });
}

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function plain(text: string): string {
  return text.replace(/\*\*/g, "").trim();
}

function numericValue(text: string): { value: number; unit: string } | null {
  const match = plain(text).replace(/,/g, "").replace(/−/g, "-").match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*(%|[KMBT])?$/i);
  if (!match) return null;
  const suffix = (match[2] ?? "").toUpperCase();
  const scale: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
  const value = Number(match[1]) * (scale[suffix] ?? 1);
  return Number.isFinite(value) ? { value, unit: suffix === "%" ? "percent" : "number" } : null;
}

function comparison(actual: string, expected: string): "above" | "below" | undefined {
  const a = numericValue(actual);
  const e = numericValue(expected);
  if (!a || !e || a.unit !== e.unit) return undefined;
  if (a.value > e.value) return "above";
  if (a.value < e.value) return "below";
  return undefined;
}

export function ReportBody({ markdown }: { markdown: string }) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let keyDataLevel: number | null = null;
  let marketLevel: number | null = null;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line || /^[-*_]{3,}$/.test(line)) { i++; continue; }
    const key = i;
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      if (/\bKey\s+Data\b|^02 Macro & Economic Conditions$/i.test(heading[2])) keyDataLevel = level;
      else if (keyDataLevel !== null && level <= keyDataLevel) keyDataLevel = null;
      if (/\bMarket\s+Read[\s-]*through\b/i.test(heading[2])) marketLevel = level;
      else if (marketLevel !== null && level <= marketLevel) marketLevel = null;
      blocks.push(<h2 key={key}>{inline(heading[2])}</h2>); i++; continue;
    }
    if (line.includes("|") && i + 1 < lines.length && /^\|?\s*:?-{3,}/.test(lines[i + 1].trim())) {
      const headers = cells(line);
      const isKeyData = keyDataLevel !== null;
      const normalized = headers.map((header) => plain(header).replace(/\s/g, "").toLowerCase());
      const assetCol = normalized.findIndex((header) => ["자산", "asset"].includes(header));
      const changeCol = normalized.findIndex((header) => ["주간변화", "weeklychange", "주간수익률", "weeklyreturn"].includes(header));
      const isMarketData = marketLevel !== null && assetCol >= 0;
      const actualCol = normalized.findIndex((header) => ["실제치", "실제", "actual"].includes(header));
      const expectedCol = normalized.findIndex((header) => ["예상치", "예상", "컨센서스", "consensus", "forecast"].includes(header));
      const interpretationCol = normalized.findIndex((header) => ["시장의미", "마켓해석", "marketinterpretation"].includes(header));
      const indicatorCol = Math.max(0, normalized.findIndex((header) => ["지표", "항목", "indicator"].includes(header)));
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(cells(lines[i++]));
      blocks.push(<div className={`weekly-table${isKeyData ? " weekly-key-data" : ""}${isMarketData ? " weekly-market-data" : ""}`} key={key} tabIndex={0} role="region" aria-label={isKeyData ? "주요 매크로 지표 표" : isMarketData ? "주간 자산 변화 표" : "리포트 데이터 표"}><table>
        <thead><tr>{headers.map((cell, col) => <th scope="col" key={col}>{inline(isKeyData && col === interpretationCol ? "마켓 해석" : cell)}</th>)}</tr></thead>
        <tbody>{rows.map((row, rowIndex) => {
          const direction = isKeyData && actualCol >= 0 && expectedCol >= 0 ? comparison(row[actualCol] ?? "", row[expectedCol] ?? "") : undefined;
          return <tr key={rowIndex}>{headers.map((_, col) => {
            const value = row[col] ?? "";
            if ((isKeyData && col === indicatorCol) || (isMarketData && col === assetCol)) return <th scope="row" key={col}>{inline(value)}</th>;
            const status = col === actualCol ? direction : undefined;
            const label = status === "above" ? "예상치 상회" : status === "below" ? "예상치 하회" : undefined;
            const classes = [
              isKeyData && col === actualCol ? "weekly-actual" : null,
              isKeyData && col === interpretationCol ? "weekly-interpretation" : null,
              isMarketData ? "weekly-market-value" : null,
              status ? `weekly-actual-${status}` : null,
            ].filter(Boolean).join(" ") || undefined;
            return <td key={col} className={classes} title={label} aria-label={label ? `${plain(value)} · ${label}` : undefined}>{isMarketData && col === changeCol ? inline(value, marketChangeText) : inline(value)}</td>;
          })}</tr>;
        })}</tbody>
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

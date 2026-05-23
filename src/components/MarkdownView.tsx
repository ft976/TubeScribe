import React from "react";
import { ShieldCheck } from "lucide-react";

interface MarkdownViewProps {
  content: string;
}

export default function MarkdownView({ content }: MarkdownViewProps) {
  if (!content) return <p className="text-zinc-400 italic">No analysis results generated.</p>;

  // Clean raw carriage return issues
  const blocks = content.replace(/\r/g, "").split(/\n\n+/);

  const renderInline = (text: string) => {
    // Process markdown helpers like bold **, italic *, inline-code `
    let parts: (string | React.JSX.Element)[] = [text];

    // Bold formatting (**)
    let boldPass: (string | React.JSX.Element)[] = [];
    parts.forEach((part) => {
      if (typeof part !== "string") {
        boldPass.push(part);
        return;
      }
      const splitArr = part.split(/\*\*([\s\S]*?)\*\*/g);
      splitArr.forEach((sub, idx) => {
        if (idx % 2 === 1) {
          boldPass.push(<strong key={`b-${idx}-${sub}`} className="font-semibold text-zinc-950">{sub}</strong>);
        } else {
          boldPass.push(sub);
        }
      });
    });
    parts = boldPass;

    // Italic formatting (*)
    let italicPass: (string | React.JSX.Element)[] = [];
    parts.forEach((part) => {
      if (typeof part !== "string") {
        italicPass.push(part);
        return;
      }
      const splitArr = part.split(/\*([\s\S]*?)\*/g);
      splitArr.forEach((sub, idx) => {
        if (idx % 2 === 1) {
          italicPass.push(<em key={`i-${idx}-${sub}`} className="italic text-zinc-850">{sub}</em>);
        } else {
          italicPass.push(sub);
        }
      });
    });
    parts = italicPass;

    // Inline Code (`)
    let codePass: (string | React.JSX.Element)[] = [];
    parts.forEach((part) => {
      if (typeof part !== "string") {
        codePass.push(part);
        return;
      }
      const splitArr = part.split(/`([^`]+)`/g);
      splitArr.forEach((sub, idx) => {
        if (idx % 2 === 1) {
          codePass.push(
            <code key={`c-${idx}-${sub}`} className="font-mono text-xs bg-zinc-100 text-rose-600 px-1.5 py-0.5 rounded border border-zinc-150 break-all whitespace-pre-wrap max-w-full">
              {sub}
            </code>
          );
        } else {
          codePass.push(sub);
        }
      });
    });
    parts = codePass;

    return parts;
  };

  const renderBlock = (block: string, blockIdx: number) => {
    const trimmed = block.trim();
    if (!trimmed) return null;

    // Headers
    if (trimmed.startsWith("# ")) {
      return (
        <h1 key={blockIdx} className="text-xl sm:text-3xl font-serif font-bold text-zinc-950 mt-6 mb-4 tracking-tight border-b border-zinc-100 pb-2">
          {renderInline(trimmed.substring(2))}
        </h1>
      );
    }
    if (trimmed.startsWith("## ")) {
      return (
        <h2 key={blockIdx} className="text-lg sm:text-2xl font-serif font-semibold text-zinc-900 mt-5 mb-3.5 tracking-tight">
          {renderInline(trimmed.substring(3))}
        </h2>
      );
    }
    if (trimmed.startsWith("### ")) {
      return (
        <h3 key={blockIdx} className="text-base sm:text-lg font-sans font-semibold text-zinc-900 mt-4 mb-3">
          {renderInline(trimmed.substring(4))}
        </h3>
      );
    }

    // Blockquote
    if (trimmed.startsWith("> ")) {
      const text = trimmed.substring(2).replace(/\n>\s*/g, " ");
      return (
        <blockquote key={blockIdx} className="border-l-4 border-rose-500 bg-rose-50/20 italic text-zinc-700 px-5 py-4 my-5 rounded-r-xl leading-relaxed break-words overflow-hidden">
          {renderInline(text)}
        </blockquote>
      );
    }

    // Lists (Unordered)
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const items = trimmed.split(/\n[-*]\s+/);
      const firstItem = items[0].startsWith("- ") || items[0].startsWith("* ") 
        ? items[0].substring(2) 
        : items[0];
      const parsedItems = [firstItem, ...items.slice(1)];

      return (
        <ul key={blockIdx} className="list-disc pl-6 space-y-2.5 my-4 text-zinc-750 text-sm/relaxed overflow-hidden">
          {parsedItems.map((item, i) => (
            <li key={i} className="break-words">{renderInline(item)}</li>
          ))}
        </ul>
      );
    }

    // Lists (Ordered)
    if (/^\d+\.\s/.test(trimmed)) {
      const items = trimmed.split(/\n\d+\.\s+/);
      const firstItem = items[0].replace(/^\d+\.\s+/, "");
      const parsedItems = [firstItem, ...items.slice(1)];

      return (
        <ol key={blockIdx} className="list-decimal pl-6 space-y-2.5 my-4 text-zinc-750 text-sm/relaxed select-none overflow-hidden">
          {parsedItems.map((item, i) => (
            <li key={i} className="break-words">{renderInline(item)}</li>
          ))}
        </ol>
      );
    }

    // Tables
    if (trimmed.startsWith("|")) {
      const lines = trimmed.split("\n").filter(l => l.trim().startsWith("|"));
      if (lines.length >= 2) {
        // Parse rows
        const rows = lines.map(line => 
          line.split("|").map(cell => cell.trim()).filter((cell, idx, arr) => idx > 0 && idx < arr.length - 1)
        );

        // Filter divider rows e.g. |---|---|
        const validRows = rows.filter(row => !row.every(cell => /^:?-+:?$/.test(cell)));

        if (validRows.length > 0) {
          const headers = validRows[0];
          const dataRows = validRows.slice(1);

          return (
            <div key={blockIdx} className="w-full overflow-x-auto my-6 border border-zinc-150 rounded-xl shadow-sm">
              <table className="min-w-full divide-y divide-zinc-150 text-[11px] sm:text-sm text-left table-auto">
                <thead className="bg-zinc-50 font-bold text-zinc-900">
                  <tr>
                    {headers.map((header, idx) => (
                      <th key={idx} className="px-3 sm:px-4 py-2.5 sm:py-3 border-r border-zinc-150 last:border-r-0 whitespace-nowrap">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white text-zinc-750">
                  {dataRows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-zinc-50/50">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="px-3 sm:px-4 py-2.5 sm:py-3 border-r border-zinc-100 last:border-r-0 max-w-24 sm:max-w-xs truncate sm:whitespace-normal">
                          {renderInline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
      }
    }

    // Standard preformatted block (e.g. code block fenced with ```)
    if (trimmed.startsWith("```")) {
      const parts = trimmed.split("```");
      const code = parts[1] ? parts[1].replace(/^[a-zA-Z]+\n/, "") : trimmed;
      return (
        <pre key={blockIdx} className="bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs font-mono p-4 rounded-xl my-4 overflow-x-auto leading-relaxed shadow-inner">
          <code>{code}</code>
        </pre>
      );
    }

    // Detect "SYLLABUS MASTER" certification tags and stylize them
    const isCertification = trimmed.toUpperCase().includes("SYLLABUS MASTER") || trimmed.toUpperCase().includes("MASTER CERTIFIED");
    if (isCertification) {
      return (
        <div key={blockIdx} className="mt-12 mb-6 p-6 border-2 border-rose-100 bg-rose-50/10 rounded-2xl text-center select-none">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-rose-100 text-rose-600 mb-3">
             <ShieldCheck className="w-6 h-6" />
          </div>
          <p className="text-[11px] sm:text-xs font-serif font-bold text-rose-900 tracking-[0.3em] uppercase">
            {trimmed}
          </p>
          <div className="h-0.5 w-16 bg-rose-200 mx-auto mt-2.5" />
        </div>
      );
    }

    // Default paragraph
    return (
      <p key={blockIdx} className="text-sm sm:text-[15px] leading-relaxed text-zinc-700 font-sans my-3.5 antialiased break-words overflow-hidden">
        {renderInline(trimmed)}
      </p>
    );
  };

  return (
    <div id="markdown-scroller" className="markdown-body text-zinc-800 selection:bg-rose-100 max-w-full overflow-hidden">
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
}

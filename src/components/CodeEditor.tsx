import React, { useRef } from "react";

// A small, dependency-free syntax highlighter. It's a regex-based
// approximation (not a real parser) but covers the common cases well
// enough for editing config/code files in the panel without pulling in
// a heavy editor library like Monaco/CodeMirror.
const KEYWORDS: Record<string, string[]> = {
  javascript: ["const","let","var","function","return","if","else","for","while","class","extends","new","import","export","default","from","async","await","try","catch","finally","throw","switch","case","break","continue","typeof","instanceof","this","super","null","undefined","true","false"],
  typescript: ["const","let","var","function","return","if","else","for","while","class","extends","implements","interface","type","enum","new","import","export","default","from","async","await","try","catch","finally","throw","switch","case","break","continue","typeof","instanceof","this","super","null","undefined","true","false","public","private","protected","readonly"],
  python: ["def","return","if","elif","else","for","while","class","import","from","as","try","except","finally","raise","with","lambda","yield","pass","break","continue","and","or","not","in","is","None","True","False","self","async","await","global","nonlocal"],
  java: ["public","private","protected","class","interface","extends","implements","static","final","void","new","return","if","else","for","while","try","catch","finally","throw","throws","import","package","this","super","null","true","false","int","long","double","float","boolean","String"],
  php: ["function","return","if","else","elseif","foreach","for","while","class","extends","implements","new","echo","print","try","catch","finally","throw","namespace","use","public","private","protected","static","const","null","true","false","this","array"],
  shell: ["if","then","else","elif","fi","for","do","done","while","case","esac","function","return","export","local","echo","exit","in"],
  yaml: [],
  json: [],
  properties: [],
  sql: ["SELECT","FROM","WHERE","INSERT","INTO","VALUES","UPDATE","SET","DELETE","CREATE","TABLE","ALTER","DROP","JOIN","LEFT","RIGHT","INNER","ON","AND","OR","NOT","NULL","PRIMARY","KEY","FOREIGN","AS","ORDER","BY","GROUP","LIMIT"],
};

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlight(code: string, language: string): string {
  const escaped = escapeHtml(code);
  const keywords = KEYWORDS[language] || [];

  // Tokenize with one combined regex so string/comment matches take
  // priority over keyword matches inside them (avoids highlighting
  // keywords that just happen to appear inside a string or comment).
  const commentPattern = language === "python" || language === "shell" || language === "yaml" || language === "properties"
    ? /#.*$/gm
    : language === "sql"
    ? /--.*$/gm
    : /\/\/.*$|\/\*[\s\S]*?\*\//g;

  const parts: { start: number; end: number; html: string }[] = [];

  const pushMatches = (regex: RegExp, cls: string) => {
    let m: RegExpExecArray | null;
    const re = new RegExp(regex);
    while ((m = re.exec(escaped))) {
      parts.push({ start: m.index, end: m.index + m[0].length, html: `<span class="tok-${cls}">${m[0]}</span>` });
      if (m[0].length === 0) re.lastIndex++;
    }
  };

  pushMatches(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, "string");
  pushMatches(commentPattern, "comment");
  pushMatches(/\b\d+(\.\d+)?\b/g, "number");
  if (keywords.length) {
    pushMatches(new RegExp(`\\b(${keywords.join("|")})\\b`, "g"), "keyword");
  }

  // Sort by start, drop any match that overlaps an earlier (higher
  // priority — strings/comments were pushed first) one.
  parts.sort((a, b) => a.start - b.start);
  const kept: typeof parts = [];
  let lastEnd = -1;
  for (const p of parts) {
    if (p.start >= lastEnd) {
      kept.push(p);
      lastEnd = p.end;
    }
  }

  let out = "";
  let cursor = 0;
  for (const p of kept) {
    out += escaped.slice(cursor, p.start) + p.html;
    cursor = p.end;
  }
  out += escaped.slice(cursor);
  return out;
}

export default function CodeEditor({
  value,
  onChange,
  language,
}: {
  value: string;
  onChange: (v: string) => void;
  language: string;
}) {
  const preRef = useRef<HTMLPreElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const syncScroll = () => {
    if (preRef.current && taRef.current) {
      preRef.current.scrollTop = taRef.current.scrollTop;
      preRef.current.scrollLeft = taRef.current.scrollLeft;
    }
  };

  const sharedStyle: React.CSSProperties = {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: "13px",
    lineHeight: "1.6",
    padding: "16px",
    margin: 0,
    whiteSpace: "pre",
    wordWrap: "normal",
    tabSize: 2,
  };

  return (
    <div className="relative w-full h-full overflow-hidden rounded-xl border border-border-subtle bg-[#0b0d12]">
      <style>{`
        .tok-keyword { color: #c792ea; }
        .tok-string { color: #c3e88d; }
        .tok-comment { color: #6b7280; font-style: italic; }
        .tok-number { color: #f78c6c; }
      `}</style>
      <pre
        ref={preRef}
        aria-hidden="true"
        style={sharedStyle}
        className="absolute inset-0 overflow-auto text-gray-200 pointer-events-none m-0"
        dangerouslySetInnerHTML={{ __html: highlight(value, language) + "\n" }}
      />
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        spellCheck={false}
        style={{ ...sharedStyle, color: "transparent", caretColor: "#e5e7eb", background: "transparent" }}
        className="absolute inset-0 w-full h-full resize-none outline-none overflow-auto"
      />
    </div>
  );
}

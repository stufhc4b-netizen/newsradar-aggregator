#!/usr/bin/env node
// NewsRadar: верстка ДОВІДКИ з JSON у .docx
// Використання: node build_dovidka.js <файл.json> <папка_виводу>
// Друкує JSON: {"docx": "...", "base": "...", "caption": "..."}
//
// Оформлення зашите за еталонним зразком і НЕ береться з JSON:
// A4; поля 2/2/3/1 см; Times New Roman 14 (таблиці й підписи 11–12);
// «ДОВІДКА» 15 пт жирним по центру, під нею підзаголовок 14 пт жирним;
// заголовки розділів жирні зліва; текст по ширині з відступом 1 см;
// списки – «•» з відступом 1 см; номер сторінки внизу по центру, лише цифра.
// У будь-якому тексті **жирний** виділяється зірочками.
"use strict";
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Footer, AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign, PageNumber
} = require("docx");

// ---------- типографіка (за зразком) ----------
const FONT = "Times New Roman";
const H1   = 30;   // 15 пт – слово «ДОВІДКА»
const BODY = 28;   // 14 пт – основний текст, заголовки розділів, списки
const CAP  = 24;   // 12 пт – підпис таблиці, колонтитул, рядок джерел
const TBL  = 22;   // 11 пт – вміст таблиць
const INK  = "000000";
const GRID = "808080";
const HEAD_FILL = "D9D9D9";
const PG_W = 11906, PG_H = 16838;             // A4
const M_TOP = 1134, M_BOT = 1134;             // 2 см
const M_LEFT = 1701, M_RIGHT = 567;           // 3 см / 1 см
const CW = PG_W - M_LEFT - M_RIGHT;           // 9638

// ---------- дані ----------
function clean(v) {
  if (typeof v === "string") {
    return v.replace(/—/g, "–").replace(/(\d) %/g, "$1 %").replace(/\s+$/g, "");
  }
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v)) o[k] = clean(v[k]); return o; }
  return v;
}
const D = clean(JSON.parse(fs.readFileSync(process.argv[2], "utf8")));
const outDir = process.argv[3] || "out";
fs.mkdirSync(outDir, { recursive: true });

// **жирний** усередині тексту -> набір TextRun
function runs(text, o = {}) {
  const size = o.size || BODY;
  return String(text ?? "").split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map(part => {
    const b = /^\*\*[^*]+\*\*$/.test(part);
    return new TextRun({
      text: b ? part.slice(2, -2) : part,
      font: FONT, size, color: INK,
      bold: b || !!o.bold, italics: !!o.italics,
    });
  });
}

// ---------- блоки ----------
const body = (t) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED, indent: { firstLine: 567 },
  spacing: { after: 60, line: 276 }, children: runs(t),
});

const heading = (t) => new Paragraph({
  keepNext: true, spacing: { before: 160, after: 80 },
  children: runs(t, { bold: true }),
});

const bullet = (t) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED,
  indent: { left: 567, hanging: 283 },
  spacing: { after: 40, line: 264 },
  children: [new TextRun({ text: "• ", font: FONT, size: BODY, color: INK }), ...runs(t)],
});

const caption = (t) => new Paragraph({
  keepNext: true, spacing: { before: 120, after: 60 },
  children: runs(t, { size: CAP, italics: true }),
});

const gap = () => new Paragraph({ spacing: { after: 60 }, children: [] });

const line = (c) => ({ style: BorderStyle.SINGLE, size: 4, color: c });
const cellBorders = { top: line(GRID), bottom: line(GRID), left: line(GRID), right: line(GRID) };

function cell(text, w, head) {
  return new TableCell({
    width: { size: w, type: WidthType.DXA }, borders: cellBorders,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    verticalAlign: VerticalAlign.CENTER,
    shading: head ? { fill: HEAD_FILL, type: ShadingType.CLEAR } : undefined,
    children: [new Paragraph({ spacing: { line: 240 }, children: runs(text, { size: TBL, bold: !!head }) })],
  });
}

function table(t) {
  const cols = t.headers.length;
  const weights = (t.widths && t.widths.length === cols) ? t.widths : Array(cols).fill(1);
  const sum = weights.reduce((a, b) => a + b, 0);
  const w = weights.map(x => Math.round(CW * x / sum));
  const rows = [new TableRow({ tableHeader: true, children: t.headers.map((h, i) => cell(h, w[i], true)) })];
  (t.rows || []).forEach(r => rows.push(new TableRow({ children: r.slice(0, cols).map((c, i) => cell(c, w[i], false)) })));
  return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: w, rows });
}

// ---------- складання ----------
const C = [];

C.push(new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { after: 60 },
  children: runs(D.title || "ДОВІДКА", { bold: true, size: H1 }),
}));
if (D.subtitle) {
  C.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 200 },
    children: runs(D.subtitle, { bold: true }),
  }));
}

let tblNo = 0;
(D.sections || []).forEach((s, idx) => {
  const num = s.number || (idx + 1);
  C.push(heading(s.heading ? `${num}. ${s.heading}` : String(num)));
  (s.paragraphs || []).forEach(p => C.push(body(p)));
  (s.bullets || []).forEach(b => C.push(bullet(b)));
  if (s.table && s.table.headers) {
    tblNo += 1;
    C.push(caption(s.table.caption || `Таблиця ${tblNo}`));
    C.push(table(s.table));
    C.push(gap());
  }
  (s.after || []).forEach(p => C.push(body(p)));
  (s.after_bullets || []).forEach(b => C.push(bullet(b)));
});

if (D.sources) {
  C.push(new Paragraph({
    alignment: AlignmentType.JUSTIFIED, spacing: { before: 120, after: 40 },
    children: runs(D.sources, { size: CAP }),
  }));
}

const doc = new Document({
  styles: { default: { document: { run: { font: FONT, size: BODY, color: INK } } } },
  sections: [{
    properties: { page: { size: { width: PG_W, height: PG_H }, margin: { top: M_TOP, right: M_RIGHT, bottom: M_BOT, left: M_LEFT } } },
    footers: { default: new Footer({ children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: CAP, color: INK })],
    })] }) },
    children: C,
  }],
});

const base = D.base || "Довідка";
const docxPath = path.join(outDir, base + ".docx");
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(docxPath, buf);
  process.stdout.write(JSON.stringify({ docx: docxPath, base, caption: D.caption || D.subtitle || D.title }));
}).catch(e => { console.error("BUILD ERROR:", e.message); process.exit(1); });

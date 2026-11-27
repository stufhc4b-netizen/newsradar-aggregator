#!/usr/bin/env node
// NewsRadar: верстка ДОВІДКИ з JSON у .docx
// Використання: node build_dovidka.js <файл.json> <папка_виводу>
// Друкує JSON: {"docx": "...", "base": "...", "caption": "..."}
//
// Оформлення зашите за вимогами замовника і НЕ береться з JSON:
// A4; поля 2/2/3/1 см; Times New Roman 14 (таблиці 11); заголовки розділів жирні;
// основний текст по ширині з відступом першого рядка 1 см; номер сторінки –
// внизу по центру, лише цифра; тире – лише середнє «–».
"use strict";
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Footer, AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign, PageNumber
} = require("docx");

// ---------- типографіка ----------
const FONT = "Times New Roman";
const BODY = 28;            // 14 pt
const TBL  = 22;            // 11 pt
const INK  = "000000";
const RULE = "808080";
const PG_W = 11906, PG_H = 16838;              // A4
const M_TOP = 1134, M_BOT = 1134;              // 2 см
const M_LEFT = 1701, M_RIGHT = 567;            // 3 см / 1 см
const CW = PG_W - M_LEFT - M_RIGHT;
const IND = { firstLine: 567 };                // 1 см

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

// ---------- будівельні блоки ----------
const run = (t, o = {}) => new TextRun({ text: String(t ?? ""), font: FONT, size: BODY, color: INK, ...o });

// абзац основного тексту: по ширині, відступ першого рядка 1 см
const body = (t) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED, indent: IND,
  spacing: { after: 80, line: 276 }, children: [run(t)],
});

// заголовок розділу: жирний, без відступу першого рядка
const heading = (t) => new Paragraph({
  keepNext: true, spacing: { before: 220, after: 90 },
  children: [run(t, { bold: true })],
});

// пункт списку: без відступу першого рядка, з виступом
const bullet = (t) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED,
  indent: { left: 567, hanging: 283 },
  spacing: { after: 70, line: 276 },
  children: [run("– "), run(t)],
});

const thin = { style: BorderStyle.SINGLE, size: 4, color: RULE };
const box = { top: thin, bottom: thin, left: thin, right: thin };
const cellPar = (t, bold) => new Paragraph({
  spacing: { line: 240 },
  children: [new TextRun({ text: String(t ?? ""), font: FONT, size: TBL, bold: !!bold, color: INK })],
});
function cell(t, w, opts = {}) {
  return new TableCell({
    width: { size: w, type: WidthType.DXA }, borders: box,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    verticalAlign: VerticalAlign.CENTER,
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
    children: [cellPar(t, opts.bold)],
  });
}
function table(t) {
  const cols = t.headers.length;
  const weights = (t.widths && t.widths.length === cols) ? t.widths : Array(cols).fill(1);
  const sum = weights.reduce((a, b) => a + b, 0);
  const w = weights.map(x => Math.round(CW * x / sum));
  const rows = [new TableRow({
    tableHeader: true,
    children: t.headers.map((h, i) => cell(h, w[i], { bold: true, fill: "E8E8E8" })),
  })];
  (t.rows || []).forEach(r => rows.push(new TableRow({
    children: r.slice(0, cols).map((c, i) => cell(c, w[i])),
  })));
  return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: w, rows });
}

// ---------- складання ----------
const C = [];

// заголовок довідки
C.push(new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { after: 260 },
  children: [run(D.title, { bold: true })],
}));

(D.sections || []).forEach((s, idx) => {
  const num = s.number || (idx + 1);
  C.push(heading(s.heading ? `${num}. ${s.heading}` : String(num)));
  (s.paragraphs || []).forEach(p => C.push(body(p)));
  (s.bullets || []).forEach(b => C.push(bullet(b)));
  if (s.table && s.table.headers) {
    C.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
    C.push(table(s.table));
    C.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
  }
  (s.after || []).forEach(p => C.push(body(p)));
});

const doc = new Document({
  styles: { default: { document: { run: { font: FONT, size: BODY, color: INK } } } },
  sections: [{
    properties: { page: { size: { width: PG_W, height: PG_H }, margin: { top: M_TOP, right: M_RIGHT, bottom: M_BOT, left: M_LEFT } } },
    // номер сторінки – внизу по центру, лише цифра
    footers: { default: new Footer({ children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: TBL, color: INK })],
    })] }) },
    children: C,
  }],
});

const base = D.base || "Довідка";
const docxPath = path.join(outDir, base + ".docx");
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(docxPath, buf);
  process.stdout.write(JSON.stringify({ docx: docxPath, base, caption: D.caption || D.title }));
}).catch(e => { console.error("BUILD ERROR:", e.message); process.exit(1); });

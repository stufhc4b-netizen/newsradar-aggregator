#!/usr/bin/env node
// NewsRadar: верстка дайджесту з JSON у .docx + .md
// Використання: node build.js <файл.json> <папка_виводу>
// Друкує JSON: {"docx": "...", "md": "...", "base": "...", "archive": "main|georgia|turkey", "caption": "..."}
"use strict";
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, ExternalHyperlink,
  TabStopType, BorderStyle, WidthType, ShadingType, VerticalAlign, PageNumber
} = require("docx");

// ---------- дані + типографіка ----------
const raw = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const outDir = process.argv[3] || "out";
fs.mkdirSync(outDir, { recursive: true });

function clean(v) {
  if (typeof v === "string") {
    return v
      .replace(/—/g, "–")                 // лише середнє тире
      .replace(/(\d) %/g, "$1\u00A0%")    // % не відривається від числа
      .replace(/\s+$/g, "");
  }
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v)) o[k] = clean(v[k]); return o; }
  return v;
}
const D = clean(raw);
const SIGS = ["КРИТИЧНО", "УВАГА", "СТАБІЛЬНО"];
const sig = s => (SIGS.includes(String(s || "").toUpperCase()) ? String(s).toUpperCase() : "УВАГА");

const FONT = "Times New Roman";
const RED = "C0392B", AMBER = "C77B16", GREEN = "1E7B34";
const INK = "1A1A1A", MUTE = "555555", RULE = "2E5A8C", LINK = "1155CC";
const BODY = 28, SMALL = 24, TINY = 20;
const M_TOP = 1134, M_BOT = 1134, M_LEFT = 1701, M_RIGHT = 567;
const PG_W = 11906, PG_H = 16838;
const CW = PG_W - M_LEFT - M_RIGHT;
const IND = { firstLine: 567 };
const sigColor = s => (s === "КРИТИЧНО" ? RED : s === "УВАГА" ? AMBER : GREEN);
const NONE = { style: BorderStyle.NONE };
const thin = c => ({ style: BorderStyle.SINGLE, size: 1, color: c });
const box = c => ({ top: thin(c), bottom: thin(c), left: thin(c), right: thin(c) });

const r = (t, o = {}) => new TextRun({ text: String(t ?? ""), font: FONT, size: BODY, color: INK, ...o });
const body = (kids, noIndent) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED, indent: noIndent ? undefined : IND,
  spacing: { after: 100, line: 288 }, children: Array.isArray(kids) ? kids : [r(kids)]
});
const small = (t, o = {}) => new Paragraph({ spacing: { after: 60 }, ...o.p,
  children: [new TextRun({ text: t, font: FONT, size: TINY, italics: true, color: MUTE, ...o.r })] });
const subHead = t => new Paragraph({ keepNext: true, spacing: { before: 140, after: 60 },
  children: [new TextRun({ text: t, font: FONT, size: BODY, bold: true, color: RULE })] });
const rule = () => new Paragraph({ spacing: { after: 120 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: RULE, space: 6 } }, children: [new TextRun({ text: "", size: 2 })] });

function sectionTitle(text, sub, pageBreak = true) {
  const k = [new Paragraph({ pageBreakBefore: pageBreak, keepNext: true, alignment: AlignmentType.CENTER, spacing: { before: 120, after: sub ? 40 : 160 },
    children: [new TextRun({ text: text.toUpperCase(), font: FONT, size: 40, bold: true, color: INK, characterSpacing: 80 })] })];
  if (sub) k.push(new Paragraph({ keepNext: true, alignment: AlignmentType.CENTER, spacing: { after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: RULE, space: 6 } },
    children: [new TextRun({ text: sub, font: FONT, size: SMALL, italics: true, color: MUTE })] }));
  else k.push(rule());
  return k;
}
function articleHead(title, s, paywall) {
  const kids = [new TextRun({ text: title, font: FONT, size: BODY, bold: true, color: INK })];
  if (paywall) kids.push(new TextRun({ text: "  [обмежений доступ]", font: FONT, size: TINY, italics: true, color: MUTE }));
  kids.push(new TextRun({ text: "\t" }), new TextRun({ text: s, font: FONT, size: TINY, bold: true, color: sigColor(s) }));
  return new Paragraph({ keepNext: true, keepLines: true, spacing: { before: 160, after: 30 },
    tabStops: [{ type: TabStopType.RIGHT, position: CW }], children: kids });
}
function quote(q) {
  if (!q || !q.text) return null;
  return new Paragraph({ indent: { left: 340 }, spacing: { before: 60, after: 60 },
    border: { top: NONE, left: { style: BorderStyle.SINGLE, size: 14, color: RULE, space: 10 }, bottom: NONE, right: NONE },
    children: [new TextRun({ text: `«${q.text.replace(/^[«"]|[»"]$/g, "")}» `, font: FONT, size: SMALL, italics: true, color: INK }),
      new TextRun({ text: q.attr ? `– ${q.attr}` : "", font: FONT, size: TINY, color: MUTE })] });
}
function whatMeans(text) {
  return new Paragraph({ spacing: { before: 100, after: 60, line: 288 }, shading: { fill: "F0F4F8", type: ShadingType.CLEAR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: RULE, space: 6 }, left: { style: BorderStyle.SINGLE, size: 18, color: RULE, space: 8 },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: RULE, space: 6 }, right: NONE },
    children: [new TextRun({ text: "Що це означає: ", font: FONT, size: BODY, bold: true, color: RULE }), r(text)] });
}
function signalLine(s) {
  const g = sig(s.sig);
  return new Paragraph({ spacing: { after: 90, line: 288 }, indent: { left: 340, hanging: 340 },
    children: [new TextRun({ text: `[${g}] `, font: FONT, size: BODY, bold: true, color: sigColor(g) }),
      new TextRun({ text: `${s.theme} – `, font: FONT, size: BODY, bold: true, color: INK }), r(s.text)] });
}
const legend = () => new Paragraph({ spacing: { before: 120, after: 40 },
  border: { top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC", space: 6 } },
  children: [new TextRun({ text: "Легенда: ", font: FONT, size: 18, bold: true, color: MUTE }),
    new TextRun({ text: "[КРИТИЧНО] – ескалація, високий ризик; [УВАГА] – неоднозначна динаміка; [СТАБІЛЬНО] – стабільно або позитивно для України.", font: FONT, size: 18, color: MUTE })] });
function linkRun(text, url, size = 18) {
  if (url && /^https?:\/\//.test(url)) return new ExternalHyperlink({ link: url, children: [new TextRun({ text, font: FONT, size, color: LINK, underline: {} })] });
  return new TextRun({ text, font: FONT, size, color: INK });
}
function headCell(t, w) {
  return new TableCell({ width: { size: w, type: WidthType.DXA }, shading: { fill: RULE, type: ShadingType.CLEAR },
    margins: { top: 70, bottom: 70, left: 100, right: 100 }, borders: box(RULE),
    children: [new Paragraph({ children: [new TextRun({ text: t, font: FONT, size: 18, bold: true, color: "FFFFFF" })] })] });
}
function cell(children, w, fill) {
  return new TableCell({ width: { size: w, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 100, right: 100 }, shading: fill ? { fill, type: ShadingType.CLEAR } : undefined,
    borders: box("CCCCCC"), children });
}
const p = (t, size = 20, o = {}) => new Paragraph({ spacing: { line: 252 }, children: [new TextRun({ text: String(t ?? ""), font: FONT, size, color: INK, ...o })] });

function footer(label) {
  return new Footer({ children: [new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: CW }],
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC", space: 6 } },
    children: [new TextRun({ text: label, font: FONT, size: 16, color: MUTE }),
      new TextRun({ text: "\tСторінка ", font: FONT, size: 16, color: MUTE }),
      new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: MUTE }),
      new TextRun({ text: " з ", font: FONT, size: 16, color: MUTE }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: MUTE })] })] });
}
function makeDoc(children, footerLabel, titlePage) {
  return new Document({
    styles: { default: { document: { run: { font: FONT, size: BODY, color: INK } } } },
    sections: [{
      properties: { page: { size: { width: PG_W, height: PG_H }, margin: { top: M_TOP, right: M_RIGHT, bottom: M_BOT, left: M_LEFT } }, titlePage: !!titlePage },
      headers: { default: new Header({ children: [new Paragraph({ children: [] })] }), ...(titlePage ? { first: new Header({ children: [new Paragraph({ children: [] })] }) } : {}) },
      footers: { default: footer(footerLabel), ...(titlePage ? { first: new Footer({ children: [new Paragraph({ children: [] })] }) } : {}) },
      children,
    }],
  });
}

// =====================================================================
//                       ЗАГАЛЬНИЙ ДАЙДЖЕСТ (main)
// =====================================================================
function buildMain(d) {
  const C = [];
  const label = d.date_label;
  const issue = d.issue || "ЩОДЕННИЙ ВИПУСК";
  const blocks = d.blocks || [];
  const articles = [];
  blocks.forEach(b => (b.articles || []).forEach(a => articles.push({ ...a, theme: b.short || b.title })));
  const st = d.stats || {};
  const selected = st.selected || String(articles.length);
  const nBlocks = st.blocks || String(blocks.length);

  // Титульна
  C.push(
    new Paragraph({ spacing: { before: 400, after: 0 }, children: [new TextRun({ text: "NEWSRADAR", font: FONT, size: 44, bold: true, color: INK, characterSpacing: 160 })] }),
    new Paragraph({ spacing: { after: 40 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: RULE, space: 8 } },
      children: [new TextRun({ text: "Аналітична розвідка західної преси", font: FONT, size: SMALL, italics: true, color: MUTE, characterSpacing: 20 })] }),
    new Paragraph({ spacing: { before: 1300, after: 0 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "АНАЛІТИЧНИЙ ДАЙДЖЕСТ", font: FONT, size: 58, bold: true, color: INK, characterSpacing: 120 })] }),
    new Paragraph({ spacing: { after: 500 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "західної преси", font: FONT, size: 44, color: INK, characterSpacing: 80 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 1200, line: 320 }, indent: { left: 900, right: 900 }, children: [new TextRun({ text: d.lead || "", font: FONT, size: SMALL, italics: true, color: INK })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 30 }, border: { top: { style: BorderStyle.SINGLE, size: 8, color: RULE, space: 8 } },
      children: [new TextRun({ text: `${label} · ${issue}`, font: FONT, size: BODY, bold: true, color: INK, characterSpacing: 40 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: d.period_line || `Період моніторингу: ${label} · ${st.materials || "—"} матеріалів · ${st.sources || "—"} джерел · ${selected} відібрано`, font: FONT, size: TINY, color: MUTE })] }),
  );

  // Параметри
  sectionTitle("Параметри випуску", "Огляд за добу").forEach(x => C.push(x));
  const third = Math.floor(CW / 3);
  const stat = (n, l) => new TableCell({ width: { size: third, type: WidthType.DXA }, borders: { top: NONE, bottom: NONE, left: NONE, right: NONE },
    margins: { top: 80, bottom: 80, left: 60, right: 60 }, verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [new TextRun({ text: String(n), font: FONT, size: 72, bold: true, color: RULE })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: l, font: FONT, size: TINY, color: MUTE })] })] });
  C.push(new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [third, third, CW - 2 * third],
    borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE },
    rows: [new TableRow({ children: [stat(st.materials || "–", "опрацьовано матеріалів"), stat(selected, `відібрано у ${nBlocks} блоків`), stat(st.sources || "–", "джерел в охопленні")] })] }));
  C.push(subHead("Охоплення моніторингу"));
  C.push(body(d.coverage || ""));
  C.push(new Paragraph({ keepNext: true, spacing: { before: 160, after: 80 }, children: [new TextRun({ text: "СИГНАЛЬНА ШКАЛА ДНЯ", font: FONT, size: BODY, bold: true, color: INK, characterSpacing: 60 })] }));
  (d.signals || []).slice(0, 5).forEach(s => C.push(signalLine(s)));
  C.push(legend());

  // Executive summary
  const S = d.summary || {};
  sectionTitle("Executive Summary").forEach(x => C.push(x));
  C.push(subHead("Загальна картина дня")); C.push(body(S.picture || ""));
  C.push(subHead("Ключові тези та тренди")); (S.theses || []).forEach(t => C.push(body(t)));
  C.push(subHead("Наслідки для України"));
  const U = S.ukraine || {};
  C.push(body([r("Можливості: ", { bold: true }), r((U.opportunities || "") + " "), r("Ризики: ", { bold: true }), r((U.risks || "") + " "), r("Відстежувати: ", { bold: true }), r(U.watch || "")]));
  C.push(subHead("Примітні публікації")); C.push(body(S.notable || ""));

  // Динаміка
  sectionTitle("Динаміка наративів", "Зміна риторики: тиждень тому vs сьогодні").forEach(x => C.push(x));
  const W0 = 1900, W1 = Math.floor((CW - W0) / 2), W2 = CW - W0 - W1;
  const dRows = [new TableRow({ tableHeader: true, children: [headCell("ТЕМА", W0), headCell("ТИЖДЕНЬ ТОМУ", W1), headCell("СЬОГОДНІ", W2)] })];
  (d.dynamics || []).forEach((x, i) => dRows.push(new TableRow({ children: [
    cell([p(x.theme, 22, { bold: true })], W0, i % 2 ? undefined : "EAF0F6"), cell([p(x.before, 22)], W1), cell([p(x.now, 22)], W2)] })));
  C.push(new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [W0, W1, W2], rows: dRows }));

  // Блоки
  blocks.forEach((b, i) => {
    C.push(new Paragraph({ pageBreakBefore: true, keepNext: true, alignment: AlignmentType.CENTER, spacing: { before: 200, after: 30 },
      children: [new TextRun({ text: `ТЕМАТИЧНИЙ БЛОК ${i + 1}`, font: FONT, size: 26, bold: true, color: RULE, characterSpacing: 100 })] }));
    C.push(new Paragraph({ keepNext: true, alignment: AlignmentType.CENTER, spacing: { after: 60 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: RULE, space: 6 } },
      children: [new TextRun({ text: b.title, font: FONT, size: 32, bold: true, color: INK })] }));
    if (b.trend) C.push(new Paragraph({ spacing: { before: 80, after: 120, line: 288 }, alignment: AlignmentType.JUSTIFIED, indent: IND,
      children: [new TextRun({ text: "Тренд дня: ", font: FONT, size: BODY, bold: true, italics: true, color: MUTE }), new TextRun({ text: b.trend, font: FONT, size: BODY, italics: true, color: INK })] }));
    (b.articles || []).forEach(a => {
      C.push(articleHead(a.title, sig(a.sig), a.paywall));
      C.push(small(a.meta || [a.media, a.genre, a.date].filter(Boolean).join(" · "), { p: { keepNext: true } }));
      C.push(body(a.text || ""));
      const q = quote(a.quote); if (q) C.push(q);
      if (a.also) C.push(small(`Також писали: ${a.also}`));
    });
    if (b.means) C.push(whatMeans(b.means));
  });

  // Коментар
  sectionTitle("Авторський коментар", "Погляд аналітичного відділу").forEach(x => C.push(x));
  (d.comment || []).forEach(t => C.push(body(t)));
  C.push(new Paragraph({ spacing: { before: 200 }, alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Автор: Аналітична команда NewsRadar", font: FONT, size: SMALL, italics: true, color: MUTE })] }));

  // Додаток
  sectionTitle("Додаток", "Зведена таблиця матеріалів").forEach(x => C.push(x));
  const T_NUM = 500, T_MEDIA = 1800, T_THEME = 2300, T_SIG = 1300, T_TITLE = CW - T_NUM - T_MEDIA - T_THEME - T_SIG;
  const aRows = [new TableRow({ tableHeader: true, children: [headCell("№", T_NUM), headCell("ВИДАННЯ", T_MEDIA), headCell("ЗАГОЛОВОК", T_TITLE), headCell("ТЕМА", T_THEME), headCell("СИГНАЛ", T_SIG)] })];
  articles.forEach((a, i) => {
    const f = i % 2 ? "F4F7FA" : undefined, g = sig(a.sig);
    aRows.push(new TableRow({ children: [
      cell([p(i + 1, 18)], T_NUM, f), cell([p(a.media || "", 18)], T_MEDIA, f),
      cell([new Paragraph({ spacing: { line: 240 }, children: [linkRun(a.title, a.url)] })], T_TITLE, f),
      cell([p(a.theme, 18)], T_THEME, f),
      cell([new Paragraph({ children: [new TextRun({ text: g, font: FONT, size: 16, bold: true, color: sigColor(g) })] })], T_SIG, f)] }));
  });
  C.push(new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [T_NUM, T_MEDIA, T_TITLE, T_THEME, T_SIG], rows: aRows }));
  C.push(new Paragraph({ spacing: { before: 300, after: 20 }, border: { top: { style: BorderStyle.SINGLE, size: 8, color: RULE, space: 8 } },
    children: [new TextRun({ text: `NewsRadar · Аналітичний дайджест західної преси · ${label} · ${issue.toLowerCase()}`, font: FONT, size: TINY, bold: true, color: INK })] }));
  C.push(small("Усі матеріали – переказ публікацій оригінальних видань; цитати наведено в перекладі з посиланням на спікера й видання; заголовки активні – ведуть на першоджерело."));

  // Markdown
  const md = [];
  md.push(`# АНАЛІТИЧНИЙ ДАЙДЖЕСТ ЗАХІДНОЇ ПРЕСИ`);
  md.push(`**NewsRadar · ${label} · Прочитано матеріалів: ${st.materials || "–"} · Джерел: ${st.sources || "–"} · Відібрано: ${selected}**`);
  md.push(`*${issue.toLowerCase()} · Джерело: ${d.channel || "RSS-агрегат + активний пошук"}*`, "");
  md.push("## СИГНАЛЬНА ШКАЛА ДНЯ");
  (d.signals || []).forEach(s => md.push(`- **[${sig(s.sig)}]** ${s.theme} – ${s.text}`));
  md.push("", "## EXECUTIVE SUMMARY", "", `**Загальна картина дня.** ${S.picture || ""}`, "", `**Ключові тези та тренди.** ${(S.theses || []).join(" ")}`, "",
    `**Наслідки для України.** Можливості: ${U.opportunities || ""} Ризики: ${U.risks || ""} Відстежувати: ${U.watch || ""}`, "", `**Примітні публікації.** ${S.notable || ""}`, "");
  md.push("## ЯК ЗМІНИЛАСЯ РИТОРИКА ЗА ТИЖДЕНЬ", "", "| ТЕМА | ТИЖДЕНЬ ТОМУ | СЬОГОДНІ |", "|------|--------------|----------|");
  (d.dynamics || []).forEach(x => md.push(`| ${x.theme} | ${x.before} | ${x.now} |`));
  md.push("", "## ТЕМАТИЧНІ БЛОКИ");
  blocks.forEach((b, i) => {
    md.push("", `### Блок ${i + 1}: ${b.title}`, `**Тренд дня:** ${b.trend || ""}`, "");
    (b.articles || []).forEach(a => md.push(`- **${a.title}** [${sig(a.sig)}] – ${a.media || ""}, ${a.date || ""}. ${a.url || ""}`));
    md.push("", `**Що це означає:** ${b.means || ""}`);
  });
  md.push("", "## АВТОРСЬКИЙ КОМЕНТАР", (d.comment || []).join("\n\n"), "", "*Автор: Аналітична команда NewsRadar*", "", "---", `*NewsRadar · Аналітичний дайджест західної преси · ${label}*`);

  return { doc: makeDoc(C, `NewsRadar · Аналітичний дайджест західної преси · ${label}`, true), md: md.join("\n"),
    base: `Дайджест_західної_преси_${d.date_iso}`, archive: "main",
    caption: `NewsRadar · Дайджест західної преси · ${label}` };
}

// =====================================================================
//                       КРАЇНОВИЙ ДАЙДЖЕСТ (country)
// =====================================================================
function buildCountry(d) {
  const C = [];
  const country = d.country;
  const label = d.date_label;
  const issue = d.issue || "щоденний випуск";
  C.push(
    new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: "NEWSRADAR", font: FONT, size: 32, bold: true, color: INK, characterSpacing: 140 })] }),
    new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "Аналітична розвідка західної преси", font: FONT, size: TINY, italics: true, color: MUTE })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 20 }, children: [new TextRun({ text: country.toUpperCase(), font: FONT, size: 40, bold: true, color: INK, characterSpacing: 120 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: RULE, space: 6 } },
      children: [new TextRun({ text: `Огляд західної преси · ${d.period_label || label} · ${issue}`, font: FONT, size: SMALL, italics: true, color: MUTE })] }),
  );
  const head = t => new Paragraph({ keepNext: true, spacing: { before: 200, after: 80 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: RULE, space: 4 } },
    children: [new TextRun({ text: t, font: FONT, size: 30, bold: true, color: RULE, characterSpacing: 80 })] });
  C.push(subHead(d.lead_title || "Головне за добу"));
  C.push(body(d.lead || ""));
  C.push(head("КЛЮЧОВІ СЮЖЕТИ"));
  (d.items || []).forEach(it => {
    C.push(articleHead(it.title, sig(it.sig), it.paywall));
    C.push(body(it.text || ""));
    const q = quote(it.quote); if (q) C.push(q);
    const src = (it.sources || []).filter(s => s && s.label);
    if (src.length) {
      const kids = [new TextRun({ text: "Джерела: ", font: FONT, size: TINY, italics: true, color: MUTE })];
      src.forEach((s, i) => { if (i) kids.push(new TextRun({ text: " · ", font: FONT, size: TINY, color: MUTE })); kids.push(linkRun(s.label, s.url, TINY)); });
      C.push(new Paragraph({ spacing: { after: 80 }, children: kids }));
    }
  });
  C.push(head("ЩО ЦЕ ОЗНАЧАЄ ДЛЯ УКРАЇНИ"));
  (d.ukraine || []).forEach(t => C.push(body(t)));
  C.push(head("ЩО ВІДСТЕЖУВАТИ"));
  const W = [CW - 2600, 2600];
  const rows = [new TableRow({ tableHeader: true, children: [headCell("МАРКЕР", W[0]), headCell("КОЛИ", W[1])] })];
  (d.watch || []).forEach((x, i) => { const f = i % 2 ? "F4F7FA" : undefined; rows.push(new TableRow({ children: [cell([p(x.marker, 22)], W[0], f), cell([p(x.when, 22)], W[1], f)] })); });
  C.push(new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: W, rows }));
  C.push(legend());
  C.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 80 }, children: [new TextRun({ text: "Автор: Аналітична команда NewsRadar", font: FONT, size: TINY, italics: true, color: MUTE })] }));

  const md = [];
  md.push(`# ${country.toUpperCase()} – ОГЛЯД ЗАХІДНОЇ ПРЕСИ`, `**NewsRadar · ${d.period_label || label} · ${issue}**`, "", `## ${d.lead_title || "Головне за добу"}`, d.lead || "", "", "## КЛЮЧОВІ СЮЖЕТИ");
  (d.items || []).forEach(it => {
    md.push("", `### ${it.title} [${sig(it.sig)}]`, it.text || "");
    if (it.quote && it.quote.text) md.push(`> «${it.quote.text}» – ${it.quote.attr || ""}`);
    const src = (it.sources || []).map(s => `${s.label}: ${s.url || ""}`).join(" · ");
    if (src) md.push(`Джерела: ${src}`);
  });
  md.push("", "## ЩО ЦЕ ОЗНАЧАЄ ДЛЯ УКРАЇНИ", (d.ukraine || []).join("\n\n"), "", "## ЩО ВІДСТЕЖУВАТИ", "", "| МАРКЕР | КОЛИ |", "|---|---|");
  (d.watch || []).forEach(x => md.push(`| ${x.marker} | ${x.when} |`));
  md.push("", "*Автор: Аналітична команда NewsRadar*");

  return { doc: makeDoc(C, `NewsRadar · ${country} · ${d.period_label || label}`, false), md: md.join("\n"),
    base: `Дайджест_${country}_${d.date_iso}`, archive: d.code || "country",
    caption: `NewsRadar · ${country} · ${d.period_label || label}` };
}

// ---------- запуск ----------
const res = D.type === "main" ? buildMain(D) : buildCountry(D);
const docxPath = path.join(outDir, res.base + ".docx");
const mdPath = path.join(outDir, res.base + ".md");
fs.writeFileSync(mdPath, res.md, "utf8");
Packer.toBuffer(res.doc).then(buf => {
  fs.writeFileSync(docxPath, buf);
  process.stdout.write(JSON.stringify({ docx: docxPath, md: mdPath, base: res.base, archive: res.archive, caption: res.caption }));
}).catch(e => { console.error("BUILD ERROR:", e.message); process.exit(1); });

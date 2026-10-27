#!/usr/bin/env python3
"""Виправляє порядок рамок абзаців у .docx (вимога стандарту Word)."""
import re, sys, zipfile, shutil
src = sys.argv[1]; tmp = src + ".tmp"
order = ["top", "left", "bottom", "right", "between", "bar"]
def fix(xml):
    def f(m):
        t = re.findall(r'(<w:(?:top|left|bottom|right|between|bar)\b[^>]*/>)', m.group(1))
        t.sort(key=lambda x: order.index(re.match(r'<w:(\w+)', x).group(1)))
        return "<w:pBdr>" + "".join(t) + "</w:pBdr>"
    return re.sub(r'<w:pBdr>(.*?)</w:pBdr>', f, xml, flags=re.S)
zi = zipfile.ZipFile(src); zo = zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED)
for it in zi.infolist():
    d = zi.read(it.filename)
    if it.filename == "word/document.xml":
        d = fix(d.decode("utf-8")).encode("utf-8")
    zo.writestr(it, d)
zi.close(); zo.close(); shutil.move(tmp, src)

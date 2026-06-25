#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NewsRadar feed aggregator.
Обходить набір RSS + Google News фідів, нормалізує записи за останні 48 годин,
дедуплікує й зливає в один JSON (digest-feed.json) для подальшого аналізу.
Без повних текстів — лише заголовок, анонс, джерело, дата, посилання.
"""

import json, re, sys, time, html, hashlib
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse, parse_qs, unquote
import xml.etree.ElementTree as ET
import urllib.request

WINDOW_HOURS = 48
OUTPUT = "digest-feed.json"
UA = "Mozilla/5.0 (compatible; NewsRadarBot/1.0; +https://github.com/)"

# ── Перелік фідів (групи відповідають OPML) ──────────────────────────────────
GN = "https://news.google.com/rss/search?q={q}&hl=en-US&gl=US&ceid=US:en"

def gn(query):
    from urllib.parse import quote
    return GN.format(q=quote(query, safe=""))

FEEDS = [
    # 1. Світові агенції та аналітика
    ("Axios", "https://api.axios.com/feed/", "agencies"),
    ("Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml", "agencies"),
    ("BBC World", "https://feeds.bbci.co.uk/news/world/rss.xml", "agencies"),
    ("Guardian World", "https://www.theguardian.com/world/rss", "agencies"),
    ("Guardian Europe", "https://www.theguardian.com/world/europe-news/rss", "agencies"),
    # 2. США
    ("NYT World", "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", "us"),
    ("NYT Politics", "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml", "us"),
    ("NYT Europe", "https://rss.nytimes.com/services/xml/rss/nyt/Europe.xml", "us"),
    ("WaPo World", "https://feeds.washingtonpost.com/rss/world", "us"),
    ("The Hill", "https://thehill.com/rss/syndicator/19110", "us"),
    ("NPR World", "https://feeds.npr.org/1004/rss.xml", "us"),
    # 3. Європа / Британія
    ("POLITICO EU", "https://www.politico.eu/feed/", "europe"),
    ("Euronews", "https://www.euronews.com/rss", "europe"),
    ("EURACTIV", "https://www.euractiv.com/feed/", "europe"),
    ("Independent World", "https://www.independent.co.uk/news/world/rss", "europe"),
    # 4. Економіка / ринки
    ("CNBC World", "https://www.cnbc.com/id/100727362/device/rss/rss.html", "markets"),
    ("CNBC Economy", "https://www.cnbc.com/id/20910258/device/rss/rss.html", "markets"),
    ("Bloomberg Markets", "https://feeds.bloomberg.com/markets/news.rss", "markets"),
    ("Bloomberg Politics", "https://feeds.bloomberg.com/politics/news.rss", "markets"),
    # 5. Think-tanks
    ("Foreign Policy", "https://foreignpolicy.com/feed/", "thinktanks"),
    ("Foreign Affairs", "https://www.foreignaffairs.com/rss.xml", "thinktanks"),
    ("War on the Rocks", "https://warontherocks.com/feed/", "thinktanks"),
    ("Defense News", "https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml", "thinktanks"),
    # 6. Росія / регіон
    ("RFE/RL", "https://www.rferl.org/api/zrqiteuuir", "russia"),
    ("Moscow Times", "https://www.themoscowtimes.com/rss/news", "russia"),
    ("Kyiv Independent", "https://kyivindependent.com/feed/", "russia"),
    # 7. Google News — закриті видання (site:, 48h)
    ("GN: WSJ", gn("site:wsj.com when:48h"), "gnews_site"),
    ("GN: FT", gn("site:ft.com when:48h"), "gnews_site"),
    ("GN: Reuters", gn("site:reuters.com when:48h"), "gnews_site"),
    ("GN: Bloomberg", gn("site:bloomberg.com when:48h"), "gnews_site"),
    ("GN: Economist", gn("site:economist.com when:48h"), "gnews_site"),
    ("GN: NYT", gn("site:nytimes.com when:48h"), "gnews_site"),
    ("GN: Politico US", gn("site:politico.com when:48h"), "gnews_site"),
    ("GN: The Atlantic", gn("site:theatlantic.com when:48h"), "gnews_site"),
    # 8. Google News — тематичні вартові (48h)
    ("GN тема: Україна", gn("Ukraine OR Zelensky OR Kyiv when:48h"), "gnews_topic"),
    ("GN тема: НАТО", gn('NATO OR "troop withdrawal" OR "defense spending" when:48h'), "gnews_topic"),
    ("GN тема: Росія/нафта", gn('Russia sanctions OR "oil price" OR refinery when:48h'), "gnews_topic"),
    ("GN тема: ЄС", gn('"European Union" enlargement OR accession Ukraine when:48h'), "gnews_topic"),
]

# ── Парсинг дат ──────────────────────────────────────────────────────────────
def parse_date(s):
    if not s:
        return None
    s = s.strip()
    fmts = [
        "%a, %d %b %Y %H:%M:%S %z", "%a, %d %b %Y %H:%M:%S %Z",
        "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M:%S",
    ]
    for f in fmts:
        try:
            d = datetime.strptime(s, f)
            if d.tzinfo is None:
                d = d.replace(tzinfo=timezone.utc)
            return d
        except ValueError:
            continue
    # RFC822 з GMT/UT
    try:
        from email.utils import parsedate_to_datetime
        d = parsedate_to_datetime(s)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d
    except Exception:
        return None

def clean(text):
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)        # прибрати HTML-теги
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:600]                            # обмежити анонс

def unwrap_google(url):
    """Google News дає редирект news.google.com/rss/articles/... — пробуємо дістати оригінал."""
    if "news.google.com" not in url:
        return url
    # інколи прямий лінк лежить у параметрі url=
    try:
        q = parse_qs(urlparse(url).query)
        if "url" in q:
            return unquote(q["url"][0])
    except Exception:
        pass
    return url  # якщо не вийшло — лишаємо редирект, прямий лінк дотягне аналітик

def fetch(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

def parse_feed(name, url, group, cutoff):
    items = []
    try:
        raw = fetch(url)
    except Exception as e:
        return items, f"{name}: FETCH ERROR {str(e)[:80]}"
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as e:
        return items, f"{name}: XML ERROR {str(e)[:60]}"

    # RSS (channel/item) та Atom (entry)
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    entries = root.findall(".//item")
    is_atom = False
    if not entries:
        entries = root.findall(".//atom:entry", ns)
        is_atom = True

    for it in entries:
        if is_atom:
            title = it.findtext("atom:title", default="", namespaces=ns)
            link_el = it.find("atom:link", ns)
            link = link_el.get("href") if link_el is not None else ""
            summary = it.findtext("atom:summary", default="", namespaces=ns) or \
                      it.findtext("atom:content", default="", namespaces=ns)
            date_s = it.findtext("atom:updated", default="", namespaces=ns) or \
                     it.findtext("atom:published", default="", namespaces=ns)
        else:
            title = it.findtext("title", default="")
            link = it.findtext("link", default="")
            summary = it.findtext("description", default="")
            date_s = it.findtext("pubDate", default="") or it.findtext("{http://purl.org/dc/elements/1.1/}date", default="")

        d = parse_date(date_s)
        # якщо дати немає — лишаємо (краще зайве, ніж пропуск), позначимо
        if d is not None and d < cutoff:
            continue

        link = unwrap_google(link.strip()) if link else ""
        title = clean(title)
        if not title:
            continue
        items.append({
            "source": name,
            "group": group,
            "title": title,
            "summary": clean(summary),
            "link": link,
            "published": d.isoformat() if d else None,
        })
    return items, f"{name}: OK ({len(items)})"

def main():
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=WINDOW_HOURS)
    all_items, log = [], []

    for name, url, group in FEEDS:
        items, status = parse_feed(name, url, group, cutoff)
        all_items.extend(items)
        log.append(status)
        time.sleep(0.5)  # делікатно до серверів

    # дедуплікація за нормалізованим заголовком.
    # Якщо трапляється дубль — лишаємо «кращий» запис: перевага прямому посиланню
    # над Google-редиректом (бо прямий лінк цінніший для зведеної таблиці).
    def is_redirect(it):
        return "news.google.com" in (it.get("link") or "")
    best = {}
    for it in all_items:
        key = re.sub(r"[^a-zа-яїієґ0-9]", "", it["title"].lower())[:80]
        if key not in best:
            best[key] = it
        else:
            # замінюємо, лише якщо новий має прямий лінк, а збережений — редирект
            if is_redirect(best[key]) and not is_redirect(it):
                best[key] = it
    deduped = list(best.values())

    # сортування: найновіше зверху
    deduped.sort(key=lambda x: x["published"] or "", reverse=True)

    out = {
        "generated_at": now.isoformat(),
        "window_hours": WINDOW_HOURS,
        "locale": "en-US",
        "total_items": len(deduped),
        "feeds_processed": len(FEEDS),
        "items": deduped,
    }
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"=== NewsRadar aggregate: {len(deduped)} items from {len(FEEDS)} feeds ===")
    for line in log:
        print(line)

if __name__ == "__main__":
    main()

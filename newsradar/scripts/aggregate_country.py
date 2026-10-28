#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NewsRadar: країновий агрегатор (Грузія / Туреччина).

Використовує рушій кореневого aggregate.py (завантаження, розбір RSS/Atom,
нормалізація, дедуплікація) – тут лише свої набори джерел.

Використання:
    python3 newsradar/scripts/aggregate_country.py georgia /tmp/nr-feed-georgia.json
    python3 newsradar/scripts/aggregate_country.py turkey  /tmp/nr-feed-turkey.json --hours 168

Нічого не комітить і не чіпає digest-feed.json – пише тільки у вказаний файл.

ВАЖЛИВО про слово "Georgia": це ще й штат США. Тематичні запити нижче навмисно
прив'язані до Тбілісі / «Грузинської мрії» / Кавказу, інакше у стрічку лізе
Атланта. Якщо додаєте свій запит – тримайтеся того самого правила.
"""

import json, sys, time, argparse
from datetime import datetime, timezone, timedelta
from pathlib import Path

# рушій – з кореневого aggregate.py
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import aggregate as engine  # noqa: E402

gn = engine.gn

GEORGIA = [
    # власні RSS, що віддають стрічку напряму
    ("OC Media",            "https://oc-media.org/feed/",            "regional", False),
    ("JAMnews",             "https://jam-news.net/feed/",            "regional", False),
    # видання без робочої RSS – через Google News ({when} підставляється нижче)
    ("Civil.ge",            "site:civil.ge {when}",                  "local",    True),
    ("Agenda.ge",           "site:agenda.ge {when}",                 "local",    True),
    ("Georgia Today",       "site:georgiatoday.ge {when}",           "local",    True),
    ("Interpressnews",      "site:interpressnews.ge {when}",         "local",    True),
    ("1TV Georgia",         "site:1tv.ge {when}",                    "local",    True),
    ("Eurasianet",          "site:eurasianet.org Georgia {when}",    "regional", True),
    ("RFE/RL Georgia",      "site:rferl.org Georgia Tbilisi {when}", "regional", True),
    # тематичні зрізи (з прив'язкою до Тбілісі, щоб не ловити штат Джорджія)
    ("GN: політика",        'Tbilisi OR "Georgian Dream" {when} -Atlanta',             "topic", True),
    ("GN: опозиція",        'Georgia Tbilisi opposition protest {when} -Atlanta',      "topic", True),
    ("GN: суди/право",      'Georgia Tbilisi court OR prosecutor {when} -Atlanta',     "topic", True),
    ("GN: ЄС/Захід",        'Georgia Tbilisi European Union OR NATO {when} -Atlanta',  "topic", True),
    ("GN: Росія",           'Georgia Tbilisi Russia OR Abkhazia {when} -Atlanta',      "topic", True),
    ("GN: економіка",       'Georgia Tbilisi economy OR lari {when} -Atlanta',         "topic", True),
    ("GN: медіа/НУО",       'Georgia Tbilisi media OR NGO crackdown {when} -Atlanta',  "topic", True),
]

TURKEY = [
    # власні RSS
    ("Turkish Minute",      "https://turkishminute.com/feed/",       "local",    False),
    ("Al-Monitor",          "https://www.al-monitor.com/rss",        "regional", False),
    # через Google News
    ("Duvar English",       "site:duvarenglish.com {when}",          "local",    True),
    ("Bianet",              "site:bianet.org {when}",                "local",    True),
    ("Hurriyet Daily News", "site:hurriyetdailynews.com {when}",     "local",    True),
    ("Daily Sabah",         "site:dailysabah.com {when}",            "local",    True),
    ("Middle East Eye",     "site:middleeasteye.net Turkey {when}",  "regional", True),
    ("RFE/RL Turkey",       "site:rferl.org Turkey {when}",          "regional", True),
    # тематичні зрізи
    ("GN: політика",        "Turkey Erdogan government Ankara {when}",          "topic", True),
    ("GN: опозиція",        "Turkey opposition CHP Imamoglu {when}",            "topic", True),
    ("GN: суди/право",      "Turkey court trial prosecutor crackdown {when}",   "topic", True),
    ("GN: ЄС/НАТО",         "Turkey European Union OR NATO relations {when}",   "topic", True),
    ("GN: Росія",           "Turkey Russia relations trade {when}",             "topic", True),
    ("GN: економіка",       "Turkey economy lira inflation central bank {when}","topic", True),
    ("GN: регіон",          "Turkey Syria OR Kurds OR Caucasus {when}",         "topic", True),
]

COUNTRIES = {"georgia": ("Грузія", GEORGIA), "turkey": ("Туреччина", TURKEY)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("country", choices=sorted(COUNTRIES))
    ap.add_argument("output")
    ap.add_argument("--hours", type=int, default=48,
                    help="вікно відбору; 48 для щоденного, 168 для тижневого")
    a = ap.parse_args()

    label, feeds = COUNTRIES[a.country]
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=a.hours)

    # Google News сортує за релевантністю, а не датою, тож без оператора when:
    # у видачу лізуть статті місячної давнини. Беремо вікно з запасом (+1 доба),
    # точну відсічку все одно робить cutoff нижче.
    when = f"when:{max(2, a.hours // 24 + 1)}d"

    all_items, log, ok_feeds = [], [], 0
    for name, src, group, is_query in feeds:
        url = gn(src.format(when=when)) if is_query else src
        items, status = engine.parse_feed(name, url, group, cutoff)
        all_items.extend(items)
        log.append(status)
        if ": OK" in status:
            ok_feeds += 1
        time.sleep(0.5)

    # дедуплікація за нормалізованим заголовком; прямий лінк кращий за Google-редирект
    def is_redirect(it):
        return "news.google.com" in (it.get("link") or "")

    best = {}
    for it in all_items:
        key = engine.re.sub(r"[^a-zа-яїієґ0-9]", "", it["title"].lower())[:80]
        if key not in best or (is_redirect(best[key]) and not is_redirect(it)):
            best[key] = it
    deduped = sorted(best.values(), key=lambda x: x["published"] or "", reverse=True)

    out = {
        "generated_at": now.isoformat(),
        "country": label,
        "code": a.country,
        "window_hours": a.hours,
        "total_items": len(deduped),
        "feeds_processed": len(feeds),
        "feeds_ok": ok_feeds,
        "items": deduped,
    }
    Path(a.output).parent.mkdir(parents=True, exist_ok=True)
    with open(a.output, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"=== NewsRadar {label}: {len(deduped)} items, {ok_feeds}/{len(feeds)} feeds OK ===")
    for line in log:
        print(line)


if __name__ == "__main__":
    main()

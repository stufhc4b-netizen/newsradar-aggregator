#!/usr/bin/env bash
# NewsRadar: JSON -> PDF -> Telegram -> архів .md у GitHub
# Використання: bash newsradar/scripts/publish.sh newsradar/data/<файл>.json
set -uo pipefail
JSON="$(realpath "$1")"
NR="$(cd "$(dirname "$0")/.." && pwd)"          # папка newsradar
REPO="$(cd "$NR/.." && pwd)"                     # корінь репозиторію
OUT="$NR/out"; mkdir -p "$OUT"
cd "$NR"
fail() { echo "ПОМИЛКА: $1"; bash "$NR/scripts/notify.sh" "❌ NewsRadar: $1" || true; exit 1; }

# 1. Бібліотека верстки
if [ ! -d "$NR/node_modules/docx" ]; then
  npm install --no-audit --no-fund --silent >/dev/null 2>&1 || fail "не вдалося встановити бібліотеку docx"
fi

# 2. Верстка
RES="$(node "$NR/scripts/build.js" "$JSON" "$OUT")" || fail "верстка не вдалася (перевір JSON: $(basename "$JSON"))"
get() { python3 -c "import sys,json;print(json.loads(sys.argv[1])[sys.argv[2]])" "$RES" "$1"; }
DOCX="$(get docx)"; MD="$(get md)"; KIND="$(get archive)"; CAPTION="$(get caption)"
python3 "$NR/scripts/fix_borders.py" "$DOCX" || fail "не вдалося виправити рамки docx"

# 3. PDF
SOFFICE="$(command -v soffice || command -v libreoffice || true)"
[ -n "$SOFFICE" ] || fail "LibreOffice не встановлено (перевір setup-скрипт середовища)"
"$SOFFICE" --headless --convert-to pdf --outdir "$OUT" "$DOCX" >/dev/null 2>&1
PDF="${DOCX%.docx}.pdf"
[ -s "$PDF" ] || fail "PDF не створено"
echo "PDF: $PDF"

# 4. Telegram
SENT=0
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
  RESP="$(curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument" \
    -F chat_id="${TELEGRAM_CHAT_ID}" -F document=@"$PDF" -F caption="$CAPTION")"
  if echo "$RESP" | grep -q '"ok":true'; then SENT=1; echo "TELEGRAM: надіслано"; else echo "TELEGRAM: помилка: $RESP"; fi
else
  echo "TELEGRAM: немає TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID"
fi

# 5. Архів .md у репозиторій (гілка main)
mkdir -p "$NR/archive/$KIND"
cp "$MD" "$NR/archive/$KIND/"
cd "$REPO"
git config user.email >/dev/null 2>&1 || git config user.email "newsradar-bot@users.noreply.github.com"
git config user.name  >/dev/null 2>&1 || git config user.name "NewsRadar bot"
git add "newsradar/archive/$KIND/$(basename "$MD")"
git commit -m "NewsRadar: архів $(basename "$MD")" >/dev/null 2>&1 || echo "GIT: нічого комітити"
PUSHED=0
for i in 1 2 3; do
  if git pull --rebase -q origin main && git push -q origin HEAD:main; then PUSHED=1; break; fi
  sleep 10
done
[ "$PUSHED" = 1 ] && echo "GIT: архів збережено в main" || echo "GIT: не вдалося запушити архів"

[ "$SENT" = 1 ] || fail "PDF зверстано, але не надіслано в Telegram"
[ "$PUSHED" = 1 ] || bash "$NR/scripts/notify.sh" "⚠️ NewsRadar: PDF надіслано, але архів .md не збережено в GitHub ($(basename "$MD"))" || true
echo "ГОТОВО"

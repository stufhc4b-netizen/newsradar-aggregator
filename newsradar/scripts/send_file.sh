#!/usr/bin/env bash
# Надсилає ГОТОВИЙ файл у Telegram. Нічого не верстає й не комітить.
# Використання: bash newsradar/scripts/send_file.sh <файл> "<підпис>" [chat_id]
# Без chat_id надсилає у TELEGRAM_CHAT_ID (робоча група).
FILE="${1:-}"; CAPTION="${2:-}"; CHAT="${3:-${TELEGRAM_CHAT_ID:-}}"
[ -s "$FILE" ] || { echo "ПОМИЛКА: немає файлу або він порожній: $FILE"; exit 1; }
[ -n "${TELEGRAM_BOT_TOKEN:-}" ] || { echo "ПОМИЛКА: немає TELEGRAM_BOT_TOKEN"; exit 1; }
[ -n "$CHAT" ] || { echo "ПОМИЛКА: не вказано chat_id і немає TELEGRAM_CHAT_ID"; exit 1; }
RESP="$(curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument" \
  -F chat_id="$CHAT" -F document=@"$FILE" -F caption="$CAPTION")"
if echo "$RESP" | grep -q '"ok":true'; then
  echo "TELEGRAM: надіслано"
else
  echo "TELEGRAM: помилка: $RESP"; exit 1
fi

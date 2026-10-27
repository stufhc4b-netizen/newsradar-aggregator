#!/usr/bin/env bash
# Надсилає коротке текстове повідомлення в Telegram.
# Використання: bash newsradar/scripts/notify.sh "текст"
TEXT="${1:-NewsRadar: повідомлення без тексту}"
if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
  echo "NOTIFY: немає TELEGRAM_BOT_TOKEN або TELEGRAM_CHAT_ID у середовищі"; exit 1
fi
curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" --data-urlencode "text=${TEXT}" >/dev/null && echo "NOTIFY: надіслано"

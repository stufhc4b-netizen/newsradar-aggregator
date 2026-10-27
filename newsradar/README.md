# NewsRadar – автоматичні дайджести

Ця папка робить три щоденні дайджести (загальний, Грузія, Туреччина) і надсилає PDF у Telegram.

- `ROUTINE_MAIN.md`, `ROUTINE_COUNTRY.md` – що робить Claude під час запуску
- `instructions/instrukciya-v3.md` – методика дайджесту
- `templates/` – зразки даних
- `scripts/` – верстка PDF, відправка в Telegram, збереження архіву
- `archive/` – попередні випуски (.md), оновлюються автоматично
- `setup-script.txt` – вставити в налаштування середовища Claude Code
- `ПРОМПТИ_ДЛЯ_РУТИН.txt` – тексти для трьох рутин

Щоб змінити методику – відредагуйте `instructions/instrukciya-v3.md` прямо на GitHub.

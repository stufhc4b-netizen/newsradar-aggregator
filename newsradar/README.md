# NewsRadar – автоматичні дайджести

Ця папка робить дайджести (загальний, Грузія, Туреччина) і надсилає PDF у Telegram.
Вівторок-неділя – щоденні випуски, понеділок – тижневі підсумки.

- `ROUTINE_MAIN.md`, `ROUTINE_COUNTRY.md` – що робить Claude під час щоденного запуску (вівторок-неділя)
- `ROUTINE_WEEKLY_MAIN.md`, `ROUTINE_WEEKLY_COUNTRY.md` – те саме для тижневих випусків (понеділок)
- `instructions/instrukciya-v3.md` – методика дайджесту
- `templates/` – зразки даних
- `scripts/` – верстка PDF, відправка в Telegram, збереження архіву
- `archive/` – попередні випуски (.md), оновлюються автоматично
- `setup-script.txt` – вставити в налаштування середовища Claude Code
- `ПРОМПТИ_ДЛЯ_РУТИН.txt` – тексти для всіх шести рутин

Щоб змінити методику – відредагуйте `instructions/instrukciya-v3.md` прямо на GitHub.

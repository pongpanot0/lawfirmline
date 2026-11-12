# LINE AI: typed leave opens the form, steadier answers

- `leaveIntent()` in `line-menu.ts`: "ลา", "ขอลาพรุ่งนี้", "จะลาป่วย", "ขอหยุดงาน" → leave flow (type prefilled when said). Questions ("ใครลาบ้าง", "ลาเหลือกี่วัน") and look-alikes (ลาออก, ลาเต้, ลายเซ็น) still go to the AI. Only outside an active flow.
- Why answers differed per person: LINE fed each user's last 10 saved secretary turns (any age, incl. web) into the AI. Now only turns from the last 30 min (`history(user, since)`).
- `temperature` 0.2 → 0; prompt rule: AI can't do actions (leave/task/expense) → point to the menu, never claim done.
- Still differs by design: case access and role-gated tools (receivables, petty cash).
- Tests: `line-bot-router.commands.spec.ts` (+leaveIntent table, router cases). 161/161 in line-conversation + secretary.

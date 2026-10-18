# Samnuan: ปล่อยระบบชำระเงิน Stripe และการล็อกเมื่อหมดอายุ

สถานะวันที่ 18 ตุลาคม 2569: โค้ดอยู่ใน PR #111 ผ่านเทสต์แล้ว แต่ยังไม่ได้ทดสอบจ่ายเงินกับ Stripe จริง และยังไม่ได้ deploy ทุกข้อด้านล่างต้องใช้ key หรือ dashboard ของเจ้าของระบบ

## สิ่งที่เปลี่ยนเมื่อ deploy

| เรื่อง | พฤติกรรมใหม่ |
| --- | --- |
| สำนักงานที่หมดอายุ (EXPIRED / CANCELED) | ดูอย่างเดียว: GET ผ่าน ส่วนการเขียนได้ `402 SUBSCRIPTION_INACTIVE` ยกเว้น route ที่ติด `@SkipSubscription` (เข้าสู่ระบบ ชำระเงิน ลบบัญชี ฯลฯ) |
| thesiambarristers | migration ตั้งเป็น `ACTIVE` และ `currentPeriodEnd = NULL` ไม่มีวันหมดอายุ |
| จ่ายด้วยบัตร | Stripe Checkout แบบ subscription ต่ออายุอัตโนมัติรายเดือนหรือรายปี ยกเลิกแล้วใช้ได้ถึงสิ้นรอบ |
| จ่ายด้วย PromptPay | Stripe Checkout จ่ายครั้งเดียวต่อรอบ ไม่ต่ออายุอัตโนมัติ ถ้าจ่ายก่อนหมดรอบ ระบบจะต่อเวลาจากวันหมดรอบเดิม |
| อีเมลเตือน | ส่งหาเจ้าของสำนักงานก่อนหมด 7 วัน, 1 วัน และวันที่หมด ทั้งช่วงทดลองและรอบที่จ่ายด้วย PromptPay (cron 09:00 ตามเวลาไทย) |
| แอปมือถือ | แสดง banner "โหมดดูอย่างเดียว" และพาออกจากหน้าสร้างข้อมูลใหม่ ไม่มีราคา ไม่มีปุ่มจ่าย และไม่มีลิงก์ไปจ่าย |

## 1. ตรวจสถานะบน prod ก่อน deploy (อ่านอย่างเดียว)

สำนักงานที่ได้ผลเป็น `will_be_read_only` จะเขียนข้อมูลไม่ได้ทันทีหลัง deploy:

```sql
SELECT slug, name, "subscriptionStatus", "trialEndAt", "currentPeriodEnd",
  CASE
    WHEN slug = 'thesiambarristers' THEN 'never_expires (migration)'
    WHEN "subscriptionStatus" IN ('EXPIRED','CANCELED') THEN 'will_be_read_only'
    WHEN "subscriptionStatus" = 'TRIAL' AND "trialEndAt" < now() THEN 'will_be_read_only'
    WHEN "subscriptionStatus" = 'TRIAL' THEN 'trial_' || ceil(extract(epoch FROM "trialEndAt" - now()) / 86400) || 'd_left'
    ELSE 'ok'
  END AS after_deploy
FROM "Firm"
ORDER BY after_deploy, "trialEndAt";
```

ถ้ามีสำนักงานที่ควรได้เวลาเพิ่ม ให้ต่อช่วงทดลองให้เฉพาะสำนักงานนั้น ก่อน deploy:
`UPDATE "Firm" SET "subscriptionStatus"='TRIAL', "trialEndAt"=now() + interval '30 days' WHERE slug='<slug>';`

## 2. ตั้งค่า Stripe

1. ใช้บัญชี Stripe ที่จดทะเบียนในประเทศไทยและใช้สกุล THB (PromptPay ใช้ได้เฉพาะบัญชีไทย)
2. Settings → Payment methods: เปิด **Cards** และ **PromptPay**
3. Settings → Billing → **Customer portal**: เปิดใช้งาน อนุญาตให้ยกเลิก (ตั้งเป็น *at end of billing period*), เปลี่ยนบัตร และดูใบแจ้งหนี้
4. Developers → Webhooks → Add endpoint `https://api.samnuan.com/saas/webhooks/stripe` แล้วเลือก event:
   - `checkout.session.completed`, `checkout.session.async_payment_succeeded`
   - `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
   - `invoice.paid`, `invoice.payment_failed`
5. เอาค่าไปใส่บนเครื่อง API (`docker-compose.prod.yml` อ่านค่าเหล่านี้):
   - `STRIPE_SECRET_KEY=sk_live_...`
   - `STRIPE_WEBHOOK_SECRET=whsec_...` (ได้จากหน้า endpoint ในข้อ 4)

ถ้ายังไม่ตั้ง key ระบบจะตอบ 503 เฉพาะตอนกดชำระเงิน ส่วนอื่นยังทำงานตามปกติ

## 3. ทดสอบบนเครื่องตัวเองด้วย test mode ก่อน merge

1. `apps/api/.env`: ใส่ `STRIPE_SECRET_KEY=sk_test_...`
2. `stripe listen --forward-to localhost:3001/saas/webhooks/stripe` แล้วเอา `whsec_...` ที่ได้มาใส่เป็น `STRIPE_WEBHOOK_SECRET`
3. เข้าสู่ระบบเป็นเจ้าของสำนักงานทดลอง → `/account/billing`:
   - **บัตร**: ใช้ `4242 4242 4242 4242` แล้วสำนักงานต้องเป็น ACTIVE มีใบเสร็จขึ้น และปุ่ม "จัดการการชำระเงิน" ต้องเปิด portal ได้
   - **PromptPay**: หน้า test ของ Stripe จะมีปุ่มจำลองการจ่าย หลังจ่ายสำนักงานต้องเป็น ACTIVE และวันหมดรอบต้องเป็นอีก 1 เดือนหรือ 1 ปี
   - ยกเลิกใน portal แล้วสำนักงานต้องยังเป็น ACTIVE จนสิ้นรอบ (`stripe trigger customer.subscription.deleted` ใช้ทดสอบสถานะ CANCELED ได้)
4. ตั้ง `trialEndAt` ของสำนักงานทดลองเป็นเมื่อวาน แล้วเช็กว่าเว็บและแอปขึ้น banner และการสร้างข้อมูลได้ 402

## 4. Deploy

Merge PR #111 → tag `prod-*` ตามปกติ migration `20261018120000_subscription_gate` จะรันเองตอน API เริ่มทำงาน ต้องตั้ง key ในข้อ 2 ก่อน

## 5. App Store review notes (ใส่ใน App Store Connect → App Review Information → Notes)

> Samnuan is practice-management software sold directly to law firms (B2B) for their lawyers and staff, under App Review Guideline 3.1.3(c) Enterprise Services. Firms subscribe and pay on our website; the app does not sell anything, show prices, or link to purchase. Staff join a firm by invitation from the firm owner. A firm owner can also create a new firm with a free 30-day trial in the app; when a firm's plan lapses the app stays usable in read-only mode.
>
> Demo account: <demo-owner email> / <password> (an active firm with sample cases).

ก่อนส่ง ให้สร้างบัญชี demo บน prod ที่เป็นสำนักงาน ACTIVE และมีข้อมูลตัวอย่าง

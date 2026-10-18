# Subscription gate + Omise → Stripe Billing (2026-10-18)

Decisions (grilled with owner):
- Payment on the web only. The app shows no price, pay button, or link (App Store anti-steering; relies on 3.1.3(c) Enterprise in the review notes).
- In-app sign-up stays, with copy aimed at firm owners ("staff: ask for an invite").
- Expired/canceled firm = read-only: GET passes, writes get 402 `SUBSCRIPTION_INACTIVE` unless the route is marked `@SkipSubscription`. This lives in `JwtAuthGuard`, because global guards run before `req.user` exists (the old global SubscriptionGuard was a no-op).
- thesiambarristers = ACTIVE with `currentPeriodEnd = NULL` → never expires (set by migration `20261018120000_subscription_gate`).
- Trial reminder emails go to OWNERs at 7 days, 1 day and 0 days before the end (`TrialReminderService`, daily 09:00 BKK, claimed through `Firm.trialReminderSentDays`).
- Stripe Billing: Checkout (subscription mode, `price_data` from PLAN_CONFIG), Customer Portal, cancel at period end. The webhook `POST /saas/webhooks/stripe` is signature-verified and re-reads the subscription from Stripe.

Deploy needs: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` on the API host. Configure the Stripe webhook endpoint and enable the Customer Portal in the Stripe dashboard.
Not done: PromptPay (Stripe Checkout subscriptions take cards only), disabling create buttons app-wide (the app shows a banner plus the 402 message instead).

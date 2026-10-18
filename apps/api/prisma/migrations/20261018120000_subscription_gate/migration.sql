-- Trial reminder bookkeeping: smallest "days before trial end" reminder already sent (7, 1, 0).
ALTER TABLE "Firm" ADD COLUMN "trialReminderSentDays" INTEGER;

-- The subscription gate becomes real in this release. The Siam Barrister is the
-- one paying customer and never expires: ACTIVE with no period end.
UPDATE "Firm"
SET "subscriptionStatus" = 'ACTIVE', "currentPeriodEnd" = NULL
WHERE "slug" = 'thesiambarristers';

-- Omise → Stripe Billing. Renames keep any historical ids; new rows carry Stripe ids.
ALTER TABLE "Firm" RENAME COLUMN "omiseCustomerId" TO "stripeCustomerId";
ALTER TABLE "Firm" ADD COLUMN "stripeSubscriptionId" TEXT;
CREATE UNIQUE INDEX "Firm_stripeCustomerId_key" ON "Firm"("stripeCustomerId");
CREATE UNIQUE INDEX "Firm_stripeSubscriptionId_key" ON "Firm"("stripeSubscriptionId");

ALTER TABLE "Subscription" RENAME COLUMN "omiseSubscriptionId" TO "stripeSubscriptionId";
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

ALTER TABLE "BillingInvoice" RENAME COLUMN "omiseChargeId" TO "stripeInvoiceId";
ALTER TABLE "BillingInvoice" ADD COLUMN "hostedInvoiceUrl" TEXT;
CREATE UNIQUE INDEX "BillingInvoice_stripeInvoiceId_key" ON "BillingInvoice"("stripeInvoiceId");

ALTER TABLE "Payment" RENAME COLUMN "omiseChargeId" TO "stripeChargeId";

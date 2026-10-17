-- Additive billing foundation. REVIEW ONLY; not applied to any database.
CREATE TABLE "billing_subscriptions" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "organizationId" TEXT NOT NULL,
 "planCode" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'DRAFT',
 "contractedSeats" INTEGER NOT NULL,
 "complimentarySeats" INTEGER NOT NULL DEFAULT 0,
 "annualAmountMinor" BIGINT NOT NULL,
 "currency" TEXT NOT NULL DEFAULT 'NGN',
 "startsAt" TIMESTAMP(3),
 "endsAt" TIMESTAMP(3),
 "graceDays" INTEGER NOT NULL DEFAULT 0,
 "contractReference" TEXT,
 "terms" JSONB,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "billing_subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "billing_subscription_seats_nonnegative" CHECK ("contractedSeats" >= 0 AND "complimentarySeats" >= 0 AND "graceDays" >= 0),
 CONSTRAINT "billing_subscription_amount_nonnegative" CHECK ("annualAmountMinor" >= 0),
 CONSTRAINT "billing_subscription_dates_valid" CHECK ("startsAt" IS NULL OR "endsAt" IS NULL OR "endsAt" > "startsAt"),
 CONSTRAINT "billing_subscriptions_org_id_key" UNIQUE ("organizationId","id")
);
CREATE INDEX "billing_subscriptions_organizationId_status_idx" ON "billing_subscriptions"("organizationId","status");

CREATE TABLE "billing_invoices" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "organizationId" TEXT NOT NULL,
 "subscriptionId" TEXT,
 "invoiceNumber" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'DRAFT',
 "currency" TEXT NOT NULL DEFAULT 'NGN',
 "subtotalMinor" BIGINT NOT NULL,
 "vatMinor" BIGINT NOT NULL DEFAULT 0,
 "totalMinor" BIGINT NOT NULL,
 "dueAt" TIMESTAMP(3),
 "issuedAt" TIMESTAMP(3),
 "lineItems" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "billing_invoices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "billing_invoices_subscription_tenant_fkey" FOREIGN KEY ("organizationId","subscriptionId") REFERENCES "billing_subscriptions"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "billing_invoice_amounts_valid" CHECK ("subtotalMinor" >= 0 AND "vatMinor" >= 0 AND "totalMinor" = "subtotalMinor" + "vatMinor"),
 CONSTRAINT "billing_invoices_org_id_key" UNIQUE ("organizationId","id")
);
CREATE UNIQUE INDEX "billing_invoices_invoiceNumber_key" ON "billing_invoices"("invoiceNumber");
CREATE INDEX "billing_invoices_organizationId_status_idx" ON "billing_invoices"("organizationId","status");
CREATE INDEX "billing_invoices_organizationId_createdAt_idx" ON "billing_invoices"("organizationId","createdAt");

CREATE TABLE "billing_payments" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "organizationId" TEXT NOT NULL,
 "invoiceId" TEXT NOT NULL,
 "amountMinor" BIGINT NOT NULL,
 "currency" TEXT NOT NULL DEFAULT 'NGN',
 "status" TEXT NOT NULL DEFAULT 'PENDING',
 "provider" TEXT,
 "providerRef" TEXT,
 "receivedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "billing_payments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "billing_payments_invoice_tenant_fkey" FOREIGN KEY ("organizationId","invoiceId") REFERENCES "billing_invoices"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "billing_payment_amount_nonnegative" CHECK ("amountMinor" >= 0)
);
CREATE UNIQUE INDEX "billing_payments_provider_providerRef_key" ON "billing_payments"("provider","providerRef");
CREATE INDEX "billing_payments_organizationId_invoiceId_idx" ON "billing_payments"("organizationId","invoiceId");

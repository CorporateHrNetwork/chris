-- Server-owned, unique offer-letter references. Draft reference allocation is not offer approval.
CREATE SEQUENCE IF NOT EXISTS public.zermatt_offer_reference_seq START WITH 1 INCREMENT BY 1;
CREATE TABLE IF NOT EXISTS public.zermatt_offer_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  "employeeId" text NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  "letterDate" date NOT NULL,
  reference text NOT NULL UNIQUE,
  "createdByUserId" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("organizationId","employeeId","letterDate")
);
CREATE INDEX IF NOT EXISTS zermatt_offer_references_organization_idx ON public.zermatt_offer_references("organizationId","createdAt");

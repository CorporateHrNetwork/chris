-- Additive preparation store. Does not update regular salary rates or execute payroll.
CREATE TABLE public.zermatt_salary_split_preparations (
  id text PRIMARY KEY,
  "organizationId" text NOT NULL REFERENCES public.organizations(id),
  "employeeId" text NOT NULL REFERENCES public.employees(id),
  "fullMonthlyGross" numeric(18,2) NOT NULL CHECK ("fullMonthlyGross">0),
  currency text NOT NULL CHECK (currency='NGN'),
  "effectiveFrom" date NOT NULL CHECK (EXTRACT(DAY FROM "effectiveFrom")=1),
  reason text NOT NULL,
  "employmentTypeSnapshot" text NOT NULL,
  "hireDateSnapshot" date NOT NULL,
  "allocationPreview" jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING_ACTIVATION' CHECK (status='PENDING_ACTIVATION'),
  "createdByUserId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("organizationId","employeeId","effectiveFrom")
);
CREATE INDEX ON public.zermatt_salary_split_preparations ("organizationId","effectiveFrom");
ALTER TABLE public.zermatt_salary_split_preparations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.zermatt_salary_split_preparations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.zermatt_salary_split_preparations TO service_role;
COMMENT ON TABLE public.zermatt_salary_split_preparations IS 'Backend-only salary preparation. No payment, loan recovery, regular payroll activation or approved-history updates.';

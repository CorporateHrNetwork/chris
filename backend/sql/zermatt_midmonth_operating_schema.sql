-- Additive rollout, inactive until an approved full-salary batch is activated.
CREATE TABLE public.zermatt_payroll_split_settings (
 "organizationId" text PRIMARY KEY REFERENCES public.organizations(id),
 "activationFrom" date NOT NULL CHECK(EXTRACT(DAY FROM "activationFrom")=1),
 enabled boolean NOT NULL DEFAULT false,
 "activatedByUserId" text NOT NULL,"activatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.payroll_salary_rates ADD COLUMN "fullMonthlyGross" numeric(18,2);
ALTER TABLE public.payroll_salary_rates ADD CONSTRAINT zll_full_salary_positive CHECK("fullMonthlyGross" IS NULL OR "fullMonthlyGross">0);
ALTER TABLE public.zermatt_salary_split_preparations ADD COLUMN "activatedAt" timestamptz;
ALTER TABLE public.zermatt_salary_split_preparations ADD COLUMN "salaryRateId" text REFERENCES public.payroll_salary_rates(id);
-- Reuse the same assignment table as regular Zermatt payroll. Staging may not
-- yet have this table; no production assignees or user records are copied.
CREATE TABLE IF NOT EXISTS public.payroll_approval_assignments (
 id text PRIMARY KEY,"organizationId" text NOT NULL REFERENCES public.organizations(id),
 responsibility text NOT NULL,"assignedUserId" text NOT NULL REFERENCES public.users(id),
 "assignedByUserId" text REFERENCES public.users(id),"isActive" boolean NOT NULL DEFAULT true,
 "assignedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE public.zermatt_midmonth_runs (
 id text PRIMARY KEY,"organizationId" text NOT NULL REFERENCES public.organizations(id),
 "periodMonth" date NOT NULL CHECK(EXTRACT(DAY FROM "periodMonth")=1),
 status text NOT NULL CHECK(status IN('DRAFT','REJECTED','AUDIT_REVIEW','GM_APPROVAL','APPROVED','PAID')),
 "sourceHash" text NOT NULL,"createdByUserId" text NOT NULL,
 "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("organizationId","periodMonth"),UNIQUE("organizationId",id)
);
CREATE TABLE public.zermatt_midmonth_lines (
 id text PRIMARY KEY,"organizationId" text NOT NULL,"runId" text NOT NULL,"employeeId" text NOT NULL REFERENCES public.employees(id),
 snapshot jsonb NOT NULL,"netPay" numeric(18,2) NOT NULL CHECK("netPay">=0),
 "actualPaid" numeric(18,2) CHECK("actualPaid">=0),"paymentReference" text,
 FOREIGN KEY("organizationId","runId") REFERENCES public.zermatt_midmonth_runs("organizationId",id),
 UNIQUE("runId","employeeId"),UNIQUE("organizationId",id)
);
CREATE TABLE public.zermatt_midmonth_balances (
 id text PRIMARY KEY,"organizationId" text NOT NULL,"employeeId" text NOT NULL REFERENCES public.employees(id),
 kind text NOT NULL CHECK(kind IN('UNPAID','OVERPAID')),
 "dueMonth" date NOT NULL CHECK(EXTRACT(DAY FROM "dueMonth")=1),
 amount numeric(18,2) NOT NULL CHECK(amount>=0),"sourceLineId" text NOT NULL,
 FOREIGN KEY("organizationId","sourceLineId") REFERENCES public.zermatt_midmonth_lines("organizationId",id),
 UNIQUE("sourceLineId",kind)
);
CREATE INDEX ON public.zermatt_midmonth_balances("organizationId","dueMonth","employeeId");
CREATE TABLE public.zermatt_midmonth_events (
 id text PRIMARY KEY,"organizationId" text NOT NULL,"runId" text NOT NULL,
 "actorUserId" text NOT NULL,action text NOT NULL,notes text NOT NULL,
 "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY("organizationId","runId") REFERENCES public.zermatt_midmonth_runs("organizationId",id)
);
DO $security$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['zermatt_payroll_split_settings','zermatt_midmonth_runs','zermatt_midmonth_lines','zermatt_midmonth_balances','zermatt_midmonth_events','payroll_approval_assignments'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',name);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.%I TO service_role',name);
 END LOOP;
END $security$;
-- Provisioning is part of the existing salary write, so new hires entered in
-- regular CHRiS obtain both elements immediately once their salary is recorded.
CREATE FUNCTION public.zermatt_allocate_full_salary_rate()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp
AS $allocation$
DECLARE starts date; typ text; full_gross numeric; pct numeric;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW."organizationId",0));
 SELECT "activationFrom" INTO starts FROM public.zermatt_payroll_split_settings WHERE "organizationId"=NEW."organizationId" AND enabled;
 IF starts IS NULL OR NEW."effectiveFrom"<starts THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=NEW."organizationId" AND slug='zermatt-liquor-limited') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND EXISTS(
  SELECT 1 FROM public.payroll_run_lines l JOIN public.payroll_runs r ON r.id=l."runId" AND r."organizationId"=l."organizationId"
  JOIN public.payroll_periods p ON p.id=r."periodId" AND p."organizationId"=r."organizationId"
  WHERE l."employeeId"=NEW."employeeId" AND l."organizationId"=NEW."organizationId" AND r.status='APPROVED'
    AND p."periodEnd">=OLD."effectiveFrom" AND p."periodStart"<=COALESCE(OLD."effectiveTo",'9999-12-31'::date)
 ) AND (NEW.amount IS DISTINCT FROM OLD.amount OR NEW."fullMonthlyGross" IS DISTINCT FROM OLD."fullMonthlyGross") THEN
  RAISE EXCEPTION 'Approved salary history is locked; create a new effective-dated full salary.';
 END IF;
 SELECT "employmentType" INTO typ FROM public.employees WHERE id=NEW."employeeId" AND "organizationId"=NEW."organizationId";
 IF typ IS NULL OR btrim(typ)='' THEN RAISE EXCEPTION 'Employment Type is required before salary allocation.'; END IF;
 IF NEW.currency<>'NGN' THEN RAISE EXCEPTION 'Zermatt salary allocation requires NGN'; END IF;
 IF TG_OP='INSERT' THEN full_gross:=COALESCE(NEW."fullMonthlyGross",NEW.amount);
 ELSIF NEW."fullMonthlyGross" IS DISTINCT FROM OLD."fullMonthlyGross" THEN full_gross:=NEW."fullMonthlyGross";
 ELSIF NEW.amount IS DISTINCT FROM OLD.amount THEN full_gross:=NEW.amount;
 ELSE RETURN NEW; END IF;
 IF full_gross IS NULL OR full_gross<=0 THEN RAISE EXCEPTION 'Full monthly gross must be positive'; END IF;
 pct:=CASE WHEN lower(regexp_replace(typ,'[ -]','','g'))='fulltime' THEN CASE WHEN full_gross>=100000 THEN 25 ELSE 16 END ELSE 0 END;
 NEW."fullMonthlyGross":=full_gross;
 NEW.amount:=full_gross-ROUND(full_gross*pct/100,2);
 RETURN NEW;
END $allocation$;
REVOKE EXECUTE ON FUNCTION public.zermatt_allocate_full_salary_rate() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aa_zermatt_allocate_full_salary BEFORE INSERT OR UPDATE OF amount,"fullMonthlyGross" ON public.payroll_salary_rates
FOR EACH ROW EXECUTE FUNCTION public.zermatt_allocate_full_salary_rate();

-- Register grantable Benefits permissions without assigning them to existing roles.
-- A Zermatt administrator grants these through a configurable tenant role.
INSERT INTO "permissions" ("id","key","name","description","createdAt","updatedAt")
VALUES
(gen_random_uuid(),'benefits.view','View Benefits','View the Benefits module overview without payroll administration rights.',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
(gen_random_uuid(),'benefits.leave_allowance.view','View Leave Allowance','View the Leave Allowance register within authorized location scope; no import, settings edit or payroll action rights.',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

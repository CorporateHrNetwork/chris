INSERT INTO "permissions" ("id", "key", "name", "description", "createdAt", "updatedAt") VALUES
(gen_random_uuid(), 'benefits.year_end_bonus.view', 'View and Export Year-End Bonus', 'View and export Zermatt Year-End Bonus calculations within assigned branches, without payroll approval or payout rights.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
ALTER TABLE payroll_variable_inputs DROP CONSTRAINT IF EXISTS payroll_variable_inputs_status_check;
ALTER TABLE payroll_variable_inputs ADD CONSTRAINT payroll_variable_inputs_status_check CHECK (status IN ('ACTIVE','CANCELLED','COMPLETED'));

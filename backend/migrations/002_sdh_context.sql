-- Run once on an existing LJH PostgreSQL private schema before deploying main.
-- -1 means SDH did not ask for a departure hour / transport preference.
BEGIN;
ALTER TABLE seaguard.plan_context DROP CONSTRAINT IF EXISTS plan_context_start_hour_check;
ALTER TABLE seaguard.plan_context DROP CONSTRAINT IF EXISTS plan_context_car_check;
ALTER TABLE seaguard.plan_context ADD CONSTRAINT plan_context_start_hour_check CHECK (start_hour BETWEEN -1 AND 23);
ALTER TABLE seaguard.plan_context ADD CONSTRAINT plan_context_car_check CHECK (car IN (-1,0,1));
COMMIT;

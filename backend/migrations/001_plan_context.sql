CREATE TABLE IF NOT EXISTS seaguard.plan_context (
    event_id text PRIMARY KEY REFERENCES seaguard.events(id),
    start_hour integer NOT NULL CHECK (start_hour BETWEEN 6 AND 17),
    risk text NOT NULL CHECK (risk IN ('낮음','주의','위험')),
    car integer NOT NULL CHECK (car IN (0,1))
);
ALTER TABLE seaguard.plan_context ADD COLUMN IF NOT EXISTS travel_date TEXT;
GRANT SELECT, INSERT ON seaguard.plan_context TO seaguard_backend;

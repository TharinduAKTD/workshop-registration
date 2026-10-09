CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(10) NOT NULL CHECK (role IN ('ADMIN','MANAGER','STAFF')),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workshops (
  id SERIAL PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  title VARCHAR(150) NOT NULL,
  instructor VARCHAR(100) NOT NULL,
  location VARCHAR(100) NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  status VARCHAR(12) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED','CANCELLED','COMPLETED')),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS registrations (
  id SERIAL PRIMARY KEY,
  workshop_id INTEGER NOT NULL REFERENCES workshops(id),
  attendee_name VARCHAR(100) NOT NULL,
  attendee_email VARCHAR(254) NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CANCELLED')),
  registered_by INTEGER NOT NULL REFERENCES users(id),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_by INTEGER REFERENCES users(id),
  cancelled_at TIMESTAMPTZ,
  CHECK ((status='ACTIVE' AND cancelled_by IS NULL AND cancelled_at IS NULL)
      OR (status='CANCELLED' AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL))
);

-- A cancelled attendee can register again as a NEW record. The old record is kept.
CREATE UNIQUE INDEX IF NOT EXISTS registrations_active_email
  ON registrations(workshop_id, attendee_email) WHERE status='ACTIVE';
CREATE INDEX IF NOT EXISTS registrations_workshop_status ON registrations(workshop_id, status);
CREATE INDEX IF NOT EXISTS workshops_date_status ON workshops(starts_at, status);

CREATE TABLE IF NOT EXISTS registration_events (
  id SERIAL PRIMARY KEY,
  registration_id INTEGER NOT NULL REFERENCES registrations(id),
  action VARCHAR(12) NOT NULL CHECK (action IN ('REGISTERED','CANCELLED')),
  actor_id INTEGER NOT NULL REFERENCES users(id),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS registration_events_registration ON registration_events(registration_id);

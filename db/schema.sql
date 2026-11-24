-- NishCloudPhone - Aiven Postgres schema
-- Run this once in Aiven (SQL editor / psql), OR just start the app:
-- the app also runs CREATE TABLE IF NOT EXISTS automatically on boot.
-- Server connection variable:  AIVEN_DATABASE_URL
-- gen_random_uuid() is built into supported PostgreSQL 13+ releases; no
-- CREATE EXTENSION permission is required by the app's startup/login path.

-- Users: name + username for login, password saved ONLY as a scrypt hash.
CREATE TABLE IF NOT EXISTS users_cloudphone (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name           TEXT NOT NULL,
    username       TEXT NOT NULL UNIQUE,
    password_hash  TEXT NOT NULL,             -- scrypt$salt$hash, never plain text
    role           TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at  TIMESTAMPTZ,
    signup_ip      TEXT,
    last_ip        TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS users_cloudphone_username_lower_idx
    ON users_cloudphone (lower(username));

-- Who created which cloud phone (a phone is only visible to its creator,
-- except the admin who can see everyone's).
CREATE TABLE IF NOT EXISTS phones_cloudphone (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_id    TEXT NOT NULL UNIQUE,          -- e.g. phone-mx1abc-xy12
    run_id      BIGINT,                        -- workflow run, filled in when it appears
    owner_id    UUID NOT NULL REFERENCES users_cloudphone(id) ON DELETE CASCADE,
    status         TEXT NOT NULL DEFAULT 'starting', -- starting|queued|in_progress|running|completed|deleting|busy|deleted
    edition        TEXT NOT NULL DEFAULT 'android11',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at     TIMESTAMPTZ,
    viewer_url     TEXT,
    tunnel_url     TEXT,
    phone_password TEXT
);
CREATE INDEX IF NOT EXISTS phones_cloudphone_owner_idx ON phones_cloudphone(owner_id, deleted_at);
CREATE INDEX IF NOT EXISTS phones_cloudphone_run_idx   ON phones_cloudphone(run_id);

-- The admin account (username: admin) is seeded automatically by the app on
-- first login attempt, using the ADMIN_PASSWORD server environment variable.
-- Passwords are hashed with scrypt; there is nothing else to insert by hand.

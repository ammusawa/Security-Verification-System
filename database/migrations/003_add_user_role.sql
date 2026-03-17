-- Migration: Add role column to users table
-- Run once: mysql -u root -p security_verification < database/migrations/003_add_user_role.sql
-- Safe to re-run: checks for column existence first.

-- Add role column (default 'user')
-- If "Duplicate column name" error, the column already exists — safe to ignore.
ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user' AFTER app_id;
ALTER TABLE users ADD INDEX ix_role (role);

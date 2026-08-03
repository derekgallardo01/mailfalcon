-- Data minimization for Google restricted-scope verification: MailFalcon
-- no longer stores a body excerpt for scheduled sends. Purge any existing
-- body previews. The column is left in place (always NULL going forward)
-- and can be formally dropped in a later drizzle-kit generated migration.
UPDATE scheduled_sends SET body_preview = NULL WHERE body_preview IS NOT NULL;

ALTER TABLE `users` ADD `trial_ends_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `welcome_email_sent_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `activation_email_sent_at` integer;--> statement-breakpoint
-- Backfill: existing users get a 14-day trial counted from their
-- signup date. If they already signed up >14 days ago this is a no-op
-- (trial_ends_at is set but already in the past), which is correct —
-- they don't get a free trial retroactively.
UPDATE `users` SET `trial_ends_at` = `created_at` + 1209600000 WHERE `trial_ends_at` IS NULL;

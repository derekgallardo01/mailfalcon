ALTER TABLE `users` ADD `installed_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `first_send_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `last_seen_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `extension_version` text;--> statement-breakpoint
ALTER TABLE `users` ADD `extension_install_id` text;--> statement-breakpoint
-- Backfill: every existing user gets first_send_at from their earliest
-- tracked email. Idempotent — only sets where currently NULL, so re-
-- applying the migration is safe.
UPDATE `users`
SET `first_send_at` = (
  SELECT MIN(`sent_at`) FROM `tracked_emails` WHERE `tracked_emails`.`user_id` = `users`.`id`
)
WHERE `first_send_at` IS NULL;

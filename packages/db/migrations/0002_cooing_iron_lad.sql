ALTER TABLE `tracked_emails` ADD `subject` text;--> statement-breakpoint
ALTER TABLE `users` ADD `digest_enabled` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `digest_last_sent_day` text;
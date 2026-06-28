ALTER TABLE `users` ADD `midday_digest_enabled` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `hot_lead_alerts_enabled` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `digest_last_sent_slot` text;--> statement-breakpoint
ALTER TABLE `notification_subscriptions` ADD `notify_open` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `notification_subscriptions` ADD `notify_click` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `notification_subscriptions` ADD `notify_reply` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `notification_subscriptions` ADD `notify_hot_lead` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE TABLE `hot_lead_alerts` (
	`user_id` text NOT NULL,
	`hashed_addr` text NOT NULL,
	`last_alerted_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `hashed_addr`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `event_webhooks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`url` text NOT NULL,
	`notify_open` integer DEFAULT 1 NOT NULL,
	`notify_click` integer DEFAULT 1 NOT NULL,
	`notify_reply` integer DEFAULT 1 NOT NULL,
	`notify_hot_lead` integer DEFAULT 1 NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`last_fired_at` integer,
	`last_status` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_webhooks_user_idx` ON `event_webhooks` (`user_id`);

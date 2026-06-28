CREATE TABLE `scheduled_sends` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scheduled_at` integer NOT NULL,
	`to_addresses` text NOT NULL,
	`cc_addresses` text DEFAULT '[]' NOT NULL,
	`bcc_addresses` text DEFAULT '[]' NOT NULL,
	`subject` text NOT NULL,
	`body_preview` text,
	`status` text NOT NULL,
	`fired_at` integer,
	`fired_email_id` text,
	`failure_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scheduled_sends_user_idx` ON `scheduled_sends` (`user_id`,`scheduled_at`);

-- 0019: Apple MPP & proxy detection + Multi-stage automated sequences + CRM Webhooks
ALTER TABLE `events` ADD `is_mpp` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `events` ADD `proxy_type` text DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE `event_webhooks` ADD `crm_type` text DEFAULT 'generic' NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `sequences` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`workspace_id` text,
	`name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sequences_user_idx` ON `sequences` (`user_id`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `sequence_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`sequence_id` text NOT NULL,
	`step_number` integer NOT NULL,
	`delay_days` integer NOT NULL,
	`condition` text DEFAULT 'no_reply' NOT NULL,
	`template_id` text,
	`subject` text NOT NULL,
	`body_html` text NOT NULL,
	FOREIGN KEY (`sequence_id`) REFERENCES `sequences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sequence_steps_seq_idx` ON `sequence_steps` (`sequence_id`,`step_number`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `sequence_enrollments` (
	`id` text PRIMARY KEY NOT NULL,
	`sequence_id` text NOT NULL,
	`user_id` text NOT NULL,
	`recipient_email` text NOT NULL,
	`current_step` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_step_at` integer,
	`next_step_at` integer NOT NULL,
	`initial_email_id` text,
	FOREIGN KEY (`sequence_id`) REFERENCES `sequences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`initial_email_id`) REFERENCES `tracked_emails`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sequence_enrollments_user_idx` ON `sequence_enrollments` (`user_id`,`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sequence_enrollments_next_step_idx` ON `sequence_enrollments` (`status`,`next_step_at`);
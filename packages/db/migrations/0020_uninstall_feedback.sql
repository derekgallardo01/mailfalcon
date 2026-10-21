CREATE TABLE `uninstall_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`install_id` text,
	`extension_version` text,
	`reason` text NOT NULL,
	`comment` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `uninstall_feedback_created_idx` ON `uninstall_feedback` (`created_at`);

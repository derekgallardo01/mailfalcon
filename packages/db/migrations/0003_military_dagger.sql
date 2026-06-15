ALTER TABLE `tracked_emails` ADD `tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `tracked_emails` ADD `notes` text DEFAULT '' NOT NULL;
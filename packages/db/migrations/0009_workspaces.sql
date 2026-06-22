CREATE TABLE `workspace_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`email` text NOT NULL,
	`invited_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `workspace_invites_email_idx` ON `workspace_invites` (`email`);--> statement-breakpoint
CREATE TABLE `workspace_members` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `user_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workspace_members_user_idx` ON `workspace_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_id` text NOT NULL,
	`is_personal` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workspaces_owner_idx` ON `workspaces` (`owner_id`);--> statement-breakpoint
ALTER TABLE `templates` ADD `workspace_id` text;--> statement-breakpoint
ALTER TABLE `users` ADD `active_workspace_id` text;--> statement-breakpoint
-- Backfill: every existing user gets a personal workspace they own.
-- Workspace id is deterministic ('ws_' || users.id) so re-applying the
-- migration is a no-op via INSERT OR IGNORE.
INSERT OR IGNORE INTO `workspaces` (`id`, `name`, `owner_id`, `is_personal`, `created_at`)
  SELECT 'ws_' || `id`, 'Personal', `id`, 1, `created_at` FROM `users`;--> statement-breakpoint
INSERT OR IGNORE INTO `workspace_members` (`workspace_id`, `user_id`, `role`, `joined_at`)
  SELECT 'ws_' || `id`, `id`, 'owner', `created_at` FROM `users`;--> statement-breakpoint
UPDATE `users` SET `active_workspace_id` = 'ws_' || `id` WHERE `active_workspace_id` IS NULL;
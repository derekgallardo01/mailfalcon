ALTER TABLE `users` ADD `email_notify_open` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `email_notify_click` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `email_notify_reply` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `email_notify_hot_lead` integer DEFAULT 1 NOT NULL;

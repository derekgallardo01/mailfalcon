CREATE TABLE `google_tokens` (
	`user_id` text PRIMARY KEY NOT NULL,
	`google_email` text NOT NULL,
	`refresh_token` text NOT NULL,
	`access_token` text,
	`access_token_expires_at` integer,
	`scopes` text NOT NULL,
	`connected_at` integer NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

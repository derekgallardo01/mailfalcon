CREATE TABLE `verify_codes` (
	`email` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`cooldown_until` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);

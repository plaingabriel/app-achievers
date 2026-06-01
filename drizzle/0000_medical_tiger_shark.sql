CREATE TABLE `account` (
	`id` varchar(36) NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` timestamp(3),
	`refresh_token_expires_at` timestamp(3),
	`scope` text,
	`password` text,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL,
	CONSTRAINT `account_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` varchar(36) NOT NULL,
	`expires_at` timestamp(3) NOT NULL,
	`token` varchar(255) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` varchar(36) NOT NULL,
	CONSTRAINT `session_id` PRIMARY KEY(`id`),
	CONSTRAINT `session_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `two_factor` (
	`id` varchar(36) NOT NULL,
	`secret` varchar(255) NOT NULL,
	`backup_codes` text NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`verified` boolean DEFAULT true,
	CONSTRAINT `two_factor_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(255) NOT NULL,
	`email_verified` boolean NOT NULL DEFAULT false,
	`image` text,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`two_factor_enabled` boolean DEFAULT false,
	`persona_id` varchar(255),
	`status` varchar(32) NOT NULL DEFAULT 'active',
	`must_change_password` boolean NOT NULL DEFAULT false,
	CONSTRAINT `user_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` varchar(36) NOT NULL,
	`identifier` varchar(255) NOT NULL,
	`value` text NOT NULL,
	`expires_at` timestamp(3) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `verification_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `permission` (
	`id` varchar(36) NOT NULL,
	`resource` varchar(64) NOT NULL,
	`action` varchar(32) NOT NULL,
	`description` varchar(255),
	CONSTRAINT `permission_id` PRIMARY KEY(`id`),
	CONSTRAINT `permission_resource_action_unique` UNIQUE(`resource`,`action`)
);
--> statement-breakpoint
CREATE TABLE `role` (
	`id` varchar(36) NOT NULL,
	`name` varchar(64) NOT NULL,
	`description` varchar(255),
	`is_system` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `role_id` PRIMARY KEY(`id`),
	CONSTRAINT `role_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `role_permission` (
	`role_id` varchar(36) NOT NULL,
	`permission_id` varchar(36) NOT NULL,
	CONSTRAINT `role_permission_role_id_permission_id_pk` PRIMARY KEY(`role_id`,`permission_id`)
);
--> statement-breakpoint
CREATE TABLE `user_role` (
	`user_id` varchar(36) NOT NULL,
	`role_id` varchar(36) NOT NULL,
	`granted_at` timestamp NOT NULL DEFAULT (now()),
	`granted_by` varchar(36),
	CONSTRAINT `user_role_user_id_role_id_pk` PRIMARY KEY(`user_id`,`role_id`)
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36),
	`actor_email` varchar(255),
	`action` varchar(64) NOT NULL,
	`target_type` varchar(64),
	`target_id` varchar(255),
	`metadata` json,
	`ip` varchar(45),
	`user_agent` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `error_log` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`level` varchar(16) NOT NULL,
	`message` text NOT NULL,
	`stack` text,
	`source` varchar(128),
	`request_id` varchar(64),
	`metadata` json,
	`emitter` varchar(32) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `error_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invitation` (
	`id` varchar(36) NOT NULL,
	`email` varchar(255) NOT NULL,
	`token_hash` varchar(255) NOT NULL,
	`role_id` varchar(36) NOT NULL,
	`invited_by` varchar(36) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`used_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invitation_id` PRIMARY KEY(`id`),
	CONSTRAINT `invitation_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
ALTER TABLE `account` ADD CONSTRAINT `account_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session` ADD CONSTRAINT `session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `two_factor` ADD CONSTRAINT `two_factor_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permission` ADD CONSTRAINT `role_permission_role_id_role_id_fk` FOREIGN KEY (`role_id`) REFERENCES `role`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permission` ADD CONSTRAINT `role_permission_permission_id_permission_id_fk` FOREIGN KEY (`permission_id`) REFERENCES `permission`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_role` ADD CONSTRAINT `user_role_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_role` ADD CONSTRAINT `user_role_role_id_role_id_fk` FOREIGN KEY (`role_id`) REFERENCES `role`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_role` ADD CONSTRAINT `user_role_granted_by_user_id_fk` FOREIGN KEY (`granted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invitation` ADD CONSTRAINT `invitation_role_id_role_id_fk` FOREIGN KEY (`role_id`) REFERENCES `role`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invitation` ADD CONSTRAINT `invitation_invited_by_user_id_fk` FOREIGN KEY (`invited_by`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `two_factor_user_id_idx` ON `two_factor` (`user_id`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE INDEX `audit_user_idx` ON `audit_log` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_action_idx` ON `audit_log` (`action`,`created_at`);--> statement-breakpoint
CREATE INDEX `errlog_created_idx` ON `error_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `errlog_level_idx` ON `error_log` (`level`,`created_at`);--> statement-breakpoint
CREATE INDEX `errlog_emitter_idx` ON `error_log` (`emitter`,`created_at`);--> statement-breakpoint
CREATE INDEX `invitation_email_idx` ON `invitation` (`email`);
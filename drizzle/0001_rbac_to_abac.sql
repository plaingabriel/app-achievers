-- ADR 0014 — migrate RBAC (roles) to per-user ABAC (admin flag + per-table grants).
-- Ordering is deliberate: add the new structures, BACKFILL from the old RBAC
-- tables, then drop them. Running this top-to-bottom never loses data, so the
-- operator just needs `pnpm db:backup` first, then `pnpm db:migrate`.

-- 1) Additive ---------------------------------------------------------------
ALTER TABLE `user` ADD `is_admin` boolean NOT NULL DEFAULT false;--> statement-breakpoint
CREATE TABLE `user_permission` (
	`user_id` varchar(36) NOT NULL,
	`resource` varchar(64) NOT NULL,
	`action` varchar(32) NOT NULL,
	`granted_at` timestamp NOT NULL DEFAULT (now()),
	`granted_by` varchar(36),
	CONSTRAINT `user_permission_user_id_resource_action_pk` PRIMARY KEY(`user_id`,`resource`,`action`)
);
--> statement-breakpoint
ALTER TABLE `user_permission` ADD CONSTRAINT `user_permission_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_permission` ADD CONSTRAINT `user_permission_granted_by_user_id_fk` FOREIGN KEY (`granted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invitation` ADD `is_admin` boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE `invitation` ADD `permissions` json;--> statement-breakpoint

-- 2) Backfill from the old RBAC data BEFORE dropping it ----------------------
-- 2a) Any holder of a system role (admin) becomes a superuser.
UPDATE `user` u
	JOIN `user_role` ur ON ur.user_id = u.id
	JOIN `role` r ON r.id = ur.role_id AND r.is_system = true
	SET u.is_admin = true;
--> statement-breakpoint
-- 2b) Everyone else: copy their data-table grants into user_permission.
INSERT INTO `user_permission` (`user_id`, `resource`, `action`)
	SELECT DISTINCT ur.user_id, p.resource, p.action
	FROM `user_role` ur
	JOIN `role_permission` rp ON rp.role_id = ur.role_id
	JOIN `permission` p ON p.id = rp.permission_id
	JOIN `user` u ON u.id = ur.user_id
	WHERE u.is_admin = false
		AND p.resource IN ('personas', 'closers', 'calendarios');
--> statement-breakpoint
-- 2c) Pending invitations: map the invited role to is_admin + a grant list.
UPDATE `invitation` i
	JOIN `role` r ON r.id = i.role_id
	SET i.is_admin = (r.is_system = true),
		i.permissions = COALESCE((
			SELECT JSON_ARRAYAGG(CONCAT(p.resource, ':', p.action))
			FROM `role_permission` rp
			JOIN `permission` p ON p.id = rp.permission_id
			WHERE rp.role_id = i.role_id
				AND p.resource IN ('personas', 'closers', 'calendarios')
		), JSON_ARRAY());
--> statement-breakpoint
UPDATE `invitation` SET `permissions` = JSON_ARRAY() WHERE `permissions` IS NULL;--> statement-breakpoint
ALTER TABLE `invitation` MODIFY COLUMN `permissions` json NOT NULL;--> statement-breakpoint

-- 3) Destructive: drop the old RBAC structures ------------------------------
ALTER TABLE `invitation` DROP FOREIGN KEY `invitation_role_id_role_id_fk`;--> statement-breakpoint
ALTER TABLE `invitation` DROP COLUMN `role_id`;--> statement-breakpoint
DROP TABLE `role_permission`;--> statement-breakpoint
DROP TABLE `user_role`;--> statement-breakpoint
DROP TABLE `permission`;--> statement-breakpoint
DROP TABLE `role`;

CREATE TABLE `grupos` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`proyecto_id` bigint NOT NULL,
	`telefono` varchar(32) NOT NULL,
	`campana` varchar(255) NOT NULL,
	`grupo` varchar(255) NOT NULL,
	`fecha` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `grupos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `grupos` ADD CONSTRAINT `grupos_proyecto_id_proyecto_id_fk` FOREIGN KEY (`proyecto_id`) REFERENCES `proyecto`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `grupos_proyecto_id_idx` ON `grupos` (`proyecto_id`);--> statement-breakpoint
CREATE INDEX `grupos_telefono_idx` ON `grupos` (`telefono`);--> statement-breakpoint
CREATE INDEX `grupos_fecha_idx` ON `grupos` (`fecha`);

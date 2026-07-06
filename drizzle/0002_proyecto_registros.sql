CREATE TABLE `proyecto` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`nombre` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `proyecto_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `registros` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`proyecto_id` bigint NOT NULL,
	`nombre` varchar(255) NOT NULL,
	`correo` varchar(255) NOT NULL,
	`telefono` varchar(32),
	`metadata` json NOT NULL,
	`origen` varchar(128) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `registros_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `registros` ADD CONSTRAINT `registros_proyecto_id_proyecto_id_fk` FOREIGN KEY (`proyecto_id`) REFERENCES `proyecto`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `registros_proyecto_id_idx` ON `registros` (`proyecto_id`);--> statement-breakpoint
CREATE INDEX `registros_correo_idx` ON `registros` (`correo`);
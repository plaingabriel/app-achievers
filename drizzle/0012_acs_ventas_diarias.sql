CREATE TABLE `acs_ventas_diarias` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`proyecto_id` bigint NOT NULL,
	`dia` date NOT NULL,
	`modalidad` varchar(100) NOT NULL,
	`edicion` varchar(36) NOT NULL DEFAULT '',
	`moneda` varchar(3) NOT NULL DEFAULT 'USD',
	`ventas` bigint NOT NULL DEFAULT 0,
	`cobros` bigint NOT NULL DEFAULT 0,
	`valor_vendido` decimal(14,2) NOT NULL DEFAULT '0.00',
	`facturacion` decimal(14,2) NOT NULL DEFAULT '0.00',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `acs_ventas_diarias_id` PRIMARY KEY(`id`),
	CONSTRAINT `acs_ventas_dia_moneda_unq` UNIQUE(`proyecto_id`,`dia`,`moneda`)
);
--> statement-breakpoint
CREATE TABLE `acs_ventas_producto_diarias` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`proyecto_id` bigint NOT NULL,
	`dia` date NOT NULL,
	`modalidad` varchar(100) NOT NULL,
	`edicion` varchar(36) NOT NULL DEFAULT '',
	`producto_id` varchar(36) NOT NULL,
	`producto_nombre` varchar(255) NOT NULL,
	`ventas` bigint NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `acs_ventas_producto_diarias_id` PRIMARY KEY(`id`),
	CONSTRAINT `acs_ventas_producto_dia_unq` UNIQUE(`proyecto_id`,`dia`,`producto_id`)
);
--> statement-breakpoint
ALTER TABLE `acs_ventas_diarias` ADD CONSTRAINT `acs_ventas_diarias_proyecto_id_proyecto_id_fk` FOREIGN KEY (`proyecto_id`) REFERENCES `proyecto`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `acs_ventas_producto_diarias` ADD CONSTRAINT `acs_ventas_producto_diarias_proyecto_id_proyecto_id_fk` FOREIGN KEY (`proyecto_id`) REFERENCES `proyecto`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `acs_ventas_proyecto_dia_idx` ON `acs_ventas_diarias` (`proyecto_id`,`dia`);--> statement-breakpoint
CREATE INDEX `acs_ventas_producto_proyecto_dia_idx` ON `acs_ventas_producto_diarias` (`proyecto_id`,`dia`);
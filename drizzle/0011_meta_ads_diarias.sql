CREATE TABLE `meta_ads_diarias` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`proyecto_id` bigint NOT NULL,
	`dia` date NOT NULL,
	`campana` varchar(255) NOT NULL,
	`inversion` decimal(12,2) NOT NULL DEFAULT '0.00',
	`clics_enlace` bigint NOT NULL DEFAULT 0,
	`landing_views` bigint NOT NULL DEFAULT 0,
	`registros_completados` bigint NOT NULL DEFAULT 0,
	`leads` bigint NOT NULL DEFAULT 0,
	`suscripciones` bigint NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `meta_ads_diarias_id` PRIMARY KEY(`id`),
	CONSTRAINT `meta_ads_dia_campana_unq` UNIQUE(`proyecto_id`,`dia`,`campana`)
);
--> statement-breakpoint
ALTER TABLE `meta_ads_diarias` ADD CONSTRAINT `meta_ads_diarias_proyecto_id_proyecto_id_fk` FOREIGN KEY (`proyecto_id`) REFERENCES `proyecto`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `meta_ads_proyecto_dia_idx` ON `meta_ads_diarias` (`proyecto_id`,`dia`);

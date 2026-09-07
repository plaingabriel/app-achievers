CREATE TABLE `metricas_historicas` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`proyecto_id` bigint NOT NULL,
	`desde` date NOT NULL,
	`hasta` date NOT NULL,
	`registros` bigint,
	`encuestas` bigint,
	`grupos` bigint,
	`vip` bigint,
	`fuente` varchar(255) NOT NULL,
	`notas` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `metricas_historicas_id` PRIMARY KEY(`id`),
	CONSTRAINT `metricas_historicas_proyecto_unq` UNIQUE(`proyecto_id`)
);
--> statement-breakpoint
ALTER TABLE `metricas_historicas` ADD CONSTRAINT `metricas_historicas_proyecto_id_proyecto_id_fk` FOREIGN KEY (`proyecto_id`) REFERENCES `proyecto`(`id`) ON DELETE cascade ON UPDATE no action;
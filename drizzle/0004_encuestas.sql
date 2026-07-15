CREATE TABLE `encuestas` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`proyecto_id` bigint NOT NULL,
	`contact_id` varchar(255) NOT NULL,
	`respuestas` json NOT NULL,
	`score` double,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `encuestas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `encuestas` ADD CONSTRAINT `encuestas_proyecto_id_proyecto_id_fk` FOREIGN KEY (`proyecto_id`) REFERENCES `proyecto`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `encuestas_proyecto_id_idx` ON `encuestas` (`proyecto_id`);--> statement-breakpoint
CREATE INDEX `encuestas_contact_id_idx` ON `encuestas` (`contact_id`);--> statement-breakpoint
CREATE INDEX `encuestas_score_idx` ON `encuestas` (`score`);

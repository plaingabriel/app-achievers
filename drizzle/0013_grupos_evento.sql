ALTER TABLE `grupos` ADD `evento` enum('entrada','salida') DEFAULT 'entrada' NOT NULL;--> statement-breakpoint
ALTER TABLE `grupos` ADD `evento_id` varchar(64);--> statement-breakpoint
ALTER TABLE `grupos` ADD CONSTRAINT `grupos_evento_id_unq` UNIQUE(`evento_id`);--> statement-breakpoint
CREATE INDEX `grupos_proyecto_telefono_grupo_idx` ON `grupos` (`proyecto_id`,`telefono`,`grupo`);
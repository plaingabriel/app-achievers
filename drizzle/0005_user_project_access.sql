CREATE TABLE `user_project_access` (
  `user_id` varchar(36) NOT NULL,
  `project_id` bigint NOT NULL,
  `granted_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `granted_by` varchar(36),
  CONSTRAINT `user_project_access_user_id_project_id_pk` PRIMARY KEY(`user_id`,`project_id`),
  CONSTRAINT `user_project_access_user_id_user_id_fk`
    FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action,
  CONSTRAINT `user_project_access_project_id_proyecto_id_fk`
    FOREIGN KEY (`project_id`) REFERENCES `proyecto`(`id`) ON DELETE cascade ON UPDATE no action,
  CONSTRAINT `user_project_access_granted_by_user_id_fk`
    FOREIGN KEY (`granted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action
);

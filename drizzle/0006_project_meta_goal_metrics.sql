ALTER TABLE `proyecto`
ADD COLUMN `meta_metrics_url` varchar(1024),
ADD COLUMN `meta_metrics_sheet_id` varchar(255),
ADD COLUMN `meta_metrics_sheet_index` bigint;

ALTER TABLE `proyecto`
ADD COLUMN `sales_project_code` varchar(100),
ADD COLUMN `vip_product_id` varchar(36),
DROP COLUMN `vip_product_name`;

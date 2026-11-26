ALTER TABLE "orders" ADD COLUMN "coupon_code" text;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_coupon_code_idx" ON "orders" USING btree ("coupon_code","user_id");--> statement-breakpoint
CREATE INDEX "product_categories_category_idx" ON "product_categories" USING btree ("category_id");--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_quantity_non_negative" CHECK ("inventory"."quantity" >= 0);--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "variant_price_non_negative" CHECK ("product_variants"."price_kobo" >= 0);--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "reservation_quantity_positive" CHECK ("stock_reservations"."quantity" > 0);
CREATE TYPE "public"."product_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."stock_movement_reason" AS ENUM('restock', 'sale', 'return', 'adjustment', 'damage');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"variant_id" uuid PRIMARY KEY NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"low_stock_threshold" integer DEFAULT 3 NOT NULL,
	"allow_backorder" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"variant_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" "stock_movement_reason" NOT NULL,
	"reference_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"product_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "product_categories_product_id_category_id_pk" PRIMARY KEY("product_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"alt" text,
	"position" integer DEFAULT 0 NOT NULL,
	"colour" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"size" text,
	"colour" text,
	"price_kobo" bigint NOT NULL,
	"compare_at_price_kobo" bigint,
	"weight_grams" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"meta_title" text,
	"meta_description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stock_reservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"variant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_idx" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "inventory_low_stock_idx" ON "inventory" USING btree ("quantity");--> statement-breakpoint
CREATE INDEX "inv_movements_variant_idx" ON "inventory_movements" USING btree ("variant_id","created_at");--> statement-breakpoint
CREATE INDEX "inv_movements_reference_idx" ON "inventory_movements" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "product_images_product_idx" ON "product_images" USING btree ("product_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "variants_sku_idx" ON "product_variants" USING btree ("sku");--> statement-breakpoint
CREATE UNIQUE INDEX "variants_option_idx" ON "product_variants" USING btree ("product_id","size","colour");--> statement-breakpoint
CREATE INDEX "variants_product_idx" ON "product_variants" USING btree ("product_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug_idx" ON "products" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "products_status_idx" ON "products" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "reservations_variant_idx" ON "stock_reservations" USING btree ("variant_id","expires_at");--> statement-breakpoint
CREATE INDEX "reservations_order_idx" ON "stock_reservations" USING btree ("order_id");
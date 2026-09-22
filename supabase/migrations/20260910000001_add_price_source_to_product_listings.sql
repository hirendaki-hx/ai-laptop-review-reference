-- Add price_source column to product_listings
-- Shape: text, check in ('auto', 'manual'), default 'auto' (matches existing image_source column)

ALTER TABLE product_listings 
ADD COLUMN IF NOT EXISTS price_source TEXT DEFAULT 'auto' CHECK (price_source IN ('auto', 'manual'));

-- Backfill any existing rows
UPDATE product_listings 
SET price_source = 'auto' 
WHERE price_source IS NULL;

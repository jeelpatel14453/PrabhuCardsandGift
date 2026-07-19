-- Website branding: store logo public URL on the singleton settings row.
-- Logo files live in Supabase Storage (product-images); only the URL is persisted here.

ALTER TABLE settings ADD COLUMN IF NOT EXISTS logo_url TEXT;

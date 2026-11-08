-- Apply in one reviewed transaction before releasing the product-link editor.
-- No product, price, stock, order, email or customer content is changed.
-- Aliases survive deletion so an old customer link cannot be claimed by a new product.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
LOCK TABLE public.custom_products IN SHARE ROW EXCLUSIVE MODE;
SELECT pg_advisory_xact_lock(hashtextextended('beauty-product-addresses',0));

CREATE TABLE IF NOT EXISTS public.beauty_product_web_addresses (
  address text PRIMARY KEY CHECK (address ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  product_slug text NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS beauty_product_one_current_address
 ON public.beauty_product_web_addresses(product_slug) WHERE is_current;

CREATE OR REPLACE FUNCTION public.wb_claim_product_address(p_address text,p_slug text,p_current boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $fn$
DECLARE owner_slug text;
BEGIN
 SELECT product_slug INTO owner_slug FROM public.beauty_product_web_addresses WHERE address=p_address;
 IF FOUND AND owner_slug<>p_slug THEN RAISE EXCEPTION 'address_in_use' USING ERRCODE='23505'; END IF;
 INSERT INTO public.beauty_product_web_addresses(address,product_slug,is_current)
 VALUES(p_address,p_slug,p_current) ON CONFLICT(address) DO NOTHING;
END $fn$;

DO $seed$
DECLARE product record; old_address text; current_address text;
BEGIN
 -- Reserve real static routes and retained legacy aliases before new allocations.
 PERFORM public.wb_claim_product_address('ghk-cu-shampoo-conditioner-bundle','@route');
 PERFORM public.wb_claim_product_address('super-human-blend','super-human-blend');
 PERFORM public.wb_claim_product_address('up389','super-human-blend');
 PERFORM public.wb_claim_product_address('dsip-5mg','dsip-5mg');
 PERFORM public.wb_claim_product_address('dsip-10mg','dsip-5mg');
 FOR product IN SELECT slug,data FROM public.custom_products ORDER BY slug LOOP
   PERFORM public.wb_claim_product_address(product.slug,product.slug);
 END LOOP;
 FOR product IN SELECT slug,data FROM public.custom_products ORDER BY slug LOOP
   current_address:=coalesce(nullif(product.data->>'webAddress',''),
     CASE product.slug WHEN 'super-human-blend' THEN 'up389' WHEN 'dsip-5mg' THEN 'dsip-10mg' ELSE product.slug END);
   PERFORM public.wb_claim_product_address(current_address,product.slug);
   IF NOT EXISTS(SELECT 1 FROM public.beauty_product_web_addresses WHERE product_slug=product.slug AND is_current) THEN
     UPDATE public.beauty_product_web_addresses SET is_current=true WHERE address=current_address AND product_slug=product.slug;
   END IF;
   FOR old_address IN SELECT jsonb_array_elements_text(coalesce(product.data->'previousWebAddresses','[]'::jsonb)) LOOP
     PERFORM public.wb_claim_product_address(old_address,product.slug);
   END LOOP;
 END LOOP;
END $seed$;

CREATE OR REPLACE FUNCTION public.wb_product_address_lock()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $fn$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('beauty-product-addresses',0));
 RETURN NULL;
END $fn$;

CREATE OR REPLACE FUNCTION public.wb_product_address_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $fn$
DECLARE current_address text; next_id text;
BEGIN
 IF TG_OP='UPDATE' AND NEW.slug<>OLD.slug THEN RAISE EXCEPTION 'product_key_is_fixed' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
   -- An UPSERT of a live row is allowed. Re-creating a deleted key is not.
   IF NOT EXISTS(SELECT 1 FROM public.custom_products WHERE slug=NEW.slug)
     AND EXISTS(SELECT 1 FROM public.beauty_product_web_addresses WHERE product_slug=NEW.slug) THEN
     RAISE EXCEPTION 'address_retired_slug' USING ERRCODE='23505';
   END IF;
   PERFORM public.wb_claim_product_address(NEW.slug,NEW.slug);
   IF NOT EXISTS(SELECT 1 FROM public.custom_products WHERE slug=NEW.slug) THEN
     -- Allocation happens after the shared statement lock, not in a browser snapshot.
     SELECT (coalesce(max(CASE WHEN data->>'id' ~ '^[0-9]+$' THEN (data->>'id')::numeric ELSE 0 END),0)+1)::text
       INTO next_id FROM public.custom_products;
     NEW.data:=jsonb_set(NEW.data,'{id}',to_jsonb(next_id));
   END IF;
   IF NOT EXISTS(SELECT 1 FROM public.beauty_product_web_addresses WHERE product_slug=NEW.slug AND is_current) THEN
     current_address:=CASE NEW.slug WHEN 'super-human-blend' THEN 'up389' WHEN 'dsip-5mg' THEN 'dsip-10mg' ELSE NEW.slug END;
     PERFORM public.wb_claim_product_address(current_address,NEW.slug);
     UPDATE public.beauty_product_web_addresses SET is_current=true WHERE address=current_address AND product_slug=NEW.slug;
   END IF;
 END IF;
 -- Browser drafts and old full-row writers cannot overwrite registry-owned history.
 NEW.data:=NEW.data-'webAddress'-'previousWebAddresses';
 RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS beauty_product_address_lock ON public.custom_products;
CREATE TRIGGER beauty_product_address_lock BEFORE INSERT OR UPDATE OR DELETE ON public.custom_products
 FOR EACH STATEMENT EXECUTE FUNCTION public.wb_product_address_lock();
DROP TRIGGER IF EXISTS beauty_product_address_guard ON public.custom_products;
CREATE TRIGGER beauty_product_address_guard BEFORE INSERT OR UPDATE ON public.custom_products
 FOR EACH ROW EXECUTE FUNCTION public.wb_product_address_guard();

CREATE OR REPLACE FUNCTION public.wb_change_product_address(p_slug text,p_address text,p_expected text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public AS $fn$
DECLARE old_address text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('beauty-product-addresses',0));
 IF p_address IS NULL OR length(p_address)>90 OR p_address!~'^[a-z0-9]+(-[a-z0-9]+)*$'
   OR p_address=ANY(ARRAY['ghk-cu-shampoo-conditioner-bundle','super-human-blend','dsip-5mg']) THEN
   RAISE EXCEPTION 'invalid_product_address' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.custom_products WHERE slug=p_slug) THEN
   RAISE EXCEPTION 'product_not_found' USING ERRCODE='P0002';
 END IF;
 SELECT address INTO old_address FROM public.beauty_product_web_addresses WHERE product_slug=p_slug AND is_current;
 IF old_address IS NULL OR old_address IS DISTINCT FROM p_expected THEN
   RAISE EXCEPTION 'address_changed_reload' USING ERRCODE='40001';
 END IF;
 IF old_address=p_address THEN RETURN jsonb_build_object('slug',p_slug,'from',old_address,'to',p_address); END IF;
 PERFORM public.wb_claim_product_address(p_address,p_slug);
 UPDATE public.beauty_product_web_addresses SET is_current=false WHERE product_slug=p_slug AND is_current;
 UPDATE public.beauty_product_web_addresses SET is_current=true WHERE product_slug=p_slug AND address=p_address;
 RETURN jsonb_build_object('slug',p_slug,'from',old_address,'to',p_address);
END $fn$;

REVOKE ALL ON FUNCTION public.wb_claim_product_address(text,text,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wb_change_product_address(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wb_product_address_lock() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wb_product_address_guard() FROM PUBLIC;
-- SECURITY INVOKER throughout. Install as, or separately grant to, the reviewed app role.

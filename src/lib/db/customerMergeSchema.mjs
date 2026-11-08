// Beauty-only, additive merge support. No historical backfill and no email sends.
// Functions use the caller's privileges; application credentials never become
// customer credentials. The audit deliberately has no cascading customer FK.
export const customerMergeStatements = [
`DO $migration$
DECLARE t text;
BEGIN
 FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='customer_id' AND NOT a.attisdropped
 WHERE n.nspname='public' AND c.relkind='r' AND a.atttypid='int4'::regtype
   AND c.relname=ANY(ARRAY['orders','customer_emails','enquiries','reviews','verification_audit_log',
     'marketing_contacts','research_chat_log','site_visits','site_interactions','ip_activity_log','member_login_log'])
   AND NOT EXISTS(SELECT 1 FROM pg_constraint f WHERE f.contype='f' AND f.conrelid=c.oid
     AND f.confrelid='public.customers'::regclass AND f.conkey=ARRAY[a.attnum]::smallint[])
 LOOP
   -- Existing orphan history is retained. Future stale writes cannot recreate
   -- a link to a customer removed by a completed merge.
   EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT wb_merge_customer_fk FOREIGN KEY(customer_id) REFERENCES public.customers(id) ON DELETE SET NULL NOT VALID',t);
 END LOOP;
END $migration$`,
`CREATE TABLE IF NOT EXISTS public.beauty_customer_merges (
  request_id uuid PRIMARY KEY, kept_id integer NOT NULL, removed_id integer NOT NULL,
  preview_hash text NOT NULL CHECK (preview_hash ~ '^[a-f0-9]{32}$'),
  kept_email text NOT NULL, removed_email text NOT NULL, moved jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), CHECK (kept_id <> removed_id)
)`,
`CREATE OR REPLACE FUNCTION public.wb_customer_merge_links()
RETURNS TABLE (schema_name text, table_name text, column_name text, handling text)
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $fn$
 WITH links AS (
   SELECT n.nspname::text ns,c.relname::text tab,a.attname::text col,true supported
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
   WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname<>'customers'
     AND a.attname IN ('customer_id','subject_customer_id','customer_id_low','customer_id_high')
     AND a.atttypid IN ('int4'::regtype,'int8'::regtype)
   UNION
   SELECT n.nspname::text,c.relname::text,a.attname::text,
     cardinality(f.conkey)=1 AND ra.attname='id' AND a.atttypid IN ('int4'::regtype,'int8'::regtype)
   FROM pg_constraint f JOIN pg_class c ON c.oid=f.conrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace
   JOIN LATERAL unnest(f.conkey,f.confkey) k(local_col,remote_col) ON true
   JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.local_col
   JOIN pg_attribute ra ON ra.attrelid=f.confrelid AND ra.attnum=k.remote_col
   WHERE f.contype='f' AND f.confrelid='public.customers'::regclass
 )
 SELECT ns,tab,col,CASE
   WHEN NOT bool_and(supported) THEN 'unsupported'
   WHEN ns='public' AND col='customer_id' AND tab=ANY(ARRAY[
     'orders','customer_emails','enquiries','reviews','verification_audit_log',
     'marketing_contacts','research_chat_log','site_visits','site_interactions',
     'ip_activity_log','member_login_log']) THEN 'move'
   WHEN ns='public' AND col='customer_id' AND tab=ANY(ARRAY[
     'customer_sessions','email_verification_tokens','password_reset_tokens']) THEN 'revoke'
   ELSE 'block' END
 FROM links GROUP BY ns,tab,col ORDER BY ns,tab,col
$fn$`,
`CREATE OR REPLACE FUNCTION public.wb_customer_merge_preview(p_keep integer,p_remove integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $fn$
DECLARE k jsonb; r jsonb; link record; n bigint; digest text; fingerprints jsonb:='[]';
  moves jsonb:='[]'; revokes jsonb:='[]'; blockers jsonb:='[]'; extra jsonb; total bigint:=0;
BEGIN
 IF p_keep IS NULL OR p_remove IS NULL OR p_keep<=0 OR p_remove<=0 OR p_keep=p_remove THEN
   RAISE EXCEPTION 'merge_invalid' USING ERRCODE='22023'; END IF;
 SELECT to_jsonb(c) INTO k FROM public.customers c WHERE id=p_keep;
 SELECT to_jsonb(c) INTO r FROM public.customers c WHERE id=p_remove;
 IF k IS NULL OR r IS NULL THEN RAISE EXCEPTION 'merge_not_found' USING ERRCODE='P0002'; END IF;
 IF k->>'banned_at' IS NOT NULL OR r->>'banned_at' IS NOT NULL
   OR k->>'account_status' IS DISTINCT FROM 'active' OR r->>'account_status' IS DISTINCT FROM 'active' THEN
   blockers:=blockers||jsonb_build_array('Both accounts must be active and not banned.'); END IF;
 IF (SELECT count(*) FROM public.customers WHERE lower(email) IN (lower(k->>'email'),lower(r->>'email')))<>2
   OR lower(k->>'email')=lower(r->>'email') THEN
   blockers:=blockers||jsonb_build_array('Login email ownership needs review.'); END IF;
 FOR link IN SELECT * FROM public.wb_customer_merge_links() LOOP
   IF link.handling='unsupported' THEN
     blockers:=blockers||jsonb_build_array('Unsupported dependency: '||link.schema_name||'.'||link.table_name); CONTINUE;
   END IF;
   EXECUTE format($query$SELECT count(*),md5(coalesce(string_agg(h,'' ORDER BY h),'')) FROM
     (SELECT md5(to_jsonb(t)::text) h FROM %I.%I t WHERE %I=$1 LIMIT 5001) q$query$,
     link.schema_name,link.table_name,link.column_name) INTO n,digest USING p_remove;
   total:=total+n;
   fingerprints:=fingerprints||jsonb_build_array(jsonb_build_array(link.schema_name,link.table_name,link.column_name,link.handling,n,digest));
   IF n>0 THEN
     IF link.handling='block' THEN blockers:=blockers||jsonb_build_array('Protected records: '||link.schema_name||'.'||link.table_name);
     ELSIF link.handling='move' THEN moves:=moves||jsonb_build_array(jsonb_build_object('table',link.table_name,'count',n));
     ELSE revokes:=revokes||jsonb_build_array(jsonb_build_object('table',link.table_name,'count',n)); END IF;
   END IF;
 END LOOP;
 IF total>5000 THEN blockers:=blockers||jsonb_build_array('This history is too large for a single merge.'); END IF;
 -- Email-only ownership and security evidence cannot be silently re-attributed.
 SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id),'[]') INTO extra FROM public.invoices i WHERE lower(email)=lower(r->>'email');
 fingerprints:=fingerprints||jsonb_build_array(md5(extra::text));
 IF jsonb_array_length(extra)>0 THEN blockers:=blockers||jsonb_build_array('Invoices at the removed email need separate ownership review.'); END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.id),'[]') INTO extra FROM public.orders o WHERE customer_id IS NULL AND lower(email)=lower(r->>'email');
 fingerprints:=fingerprints||jsonb_build_array(md5(extra::text));
 IF jsonb_array_length(extra)>0 THEN blockers:=blockers||jsonb_build_array('Unlinked orders at the removed email need review.'); END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]') INTO extra FROM public.discount_signups s
   WHERE lower(email)=lower(r->>'email') OR upper(code)=upper(r->>'discount_code');
 fingerprints:=fingerprints||jsonb_build_array(md5(extra::text));
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(extra) e WHERE e->>'status' IS DISTINCT FROM 'used' OR e->>'reservation_token' IS NOT NULL) THEN
   blockers:=blockers||jsonb_build_array('The removed account has an active or reserved welcome code. Review it first; do not mark an unused code as spent just to merge.'); END IF;
 IF r->>'discount_code' IS NOT NULL AND jsonb_array_length(extra)<>1 THEN
   blockers:=blockers||jsonb_build_array('Welcome code ownership needs review.'); END IF;
 IF r->>'discount_code' IS NOT NULL AND EXISTS(SELECT 1 FROM public.customers WHERE id<>p_remove AND upper(discount_code)=upper(r->>'discount_code')) THEN
   blockers:=blockers||jsonb_build_array('A welcome code is shared with another account.'); END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]') INTO extra FROM public.security_review_cases s
   WHERE matched_customer_ids @> jsonb_build_array(p_remove) OR matched_customer_ids @> jsonb_build_array(p_remove::text);
 fingerprints:=fingerprints||jsonb_build_array(md5(extra::text));
 IF jsonb_array_length(extra)>0 THEN blockers:=blockers||jsonb_build_array('Security Review evidence refers to this account.'); END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.id),'[]') INTO extra FROM public.customer_bans b
   WHERE lower(customer_email) IN (lower(k->>'email'),lower(r->>'email'));
 fingerprints:=fingerprints||jsonb_build_array(md5(extra::text));
 IF jsonb_array_length(extra)>0 THEN blockers:=blockers||jsonb_build_array('Ban history needs separate review.'); END IF;
 RETURN jsonb_build_object('keep',jsonb_build_object('id',p_keep,'email',k->>'email','name',concat_ws(' ',k->>'first_name',k->>'last_name')),
   'remove',jsonb_build_object('id',p_remove,'email',r->>'email','name',concat_ws(' ',r->>'first_name',r->>'last_name')),
   'moves',moves,'revokes',revokes,'blockers',blockers,'fingerprint',md5(k::text||r::text||fingerprints::text));
END $fn$`,
`CREATE OR REPLACE FUNCTION public.wb_customer_merge_execute(p_request uuid,p_keep integer,p_remove integer,p_preview text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $fn$
DECLARE previous public.beauty_customer_merges%ROWTYPE; current_preview jsonb; link record; moved jsonb;
BEGIN
 IF p_request IS NULL OR p_preview IS NULL OR p_preview !~ '^[a-f0-9]{32}$' THEN RAISE EXCEPTION 'merge_invalid' USING ERRCODE='22023'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'merge_isolation' USING ERRCODE='25000'; END IF;
 PERFORM set_config('lock_timeout','1500ms',true);
 PERFORM pg_advisory_xact_lock(hashtextextended('beauty-customer-merge:'||p_request::text,0));
 SELECT * INTO previous FROM public.beauty_customer_merges WHERE request_id=p_request;
 IF FOUND THEN
   IF previous.kept_id IS DISTINCT FROM p_keep OR previous.removed_id IS DISTINCT FROM p_remove OR previous.preview_hash IS DISTINCT FROM p_preview THEN
     RAISE EXCEPTION 'merge_request_conflict' USING ERRCODE='22023'; END IF;
   RETURN jsonb_build_object('keptId',previous.kept_id,'removedId',previous.removed_id,'replayed',true);
 END IF;
 -- No application write can introduce a late customer/FK or mutate history
 -- between the fresh preview and deletion. Readers continue; lock contention
 -- aborts instead of leaving a partial merge. All merge calls take this order.
 LOCK TABLE public.customers IN SHARE ROW EXCLUSIVE MODE;
 PERFORM id FROM public.customers WHERE id IN(p_keep,p_remove) ORDER BY id FOR UPDATE;
 FOR link IN
   SELECT DISTINCT schema_name,table_name FROM public.wb_customer_merge_links()
   UNION SELECT 'public','invoices' UNION SELECT 'public','discount_signups'
   UNION SELECT 'public','security_review_cases' UNION SELECT 'public','customer_bans'
   ORDER BY 1,2
 LOOP EXECUTE format('LOCK TABLE %I.%I IN SHARE ROW EXCLUSIVE MODE',link.schema_name,link.table_name); END LOOP;
 current_preview:=public.wb_customer_merge_preview(p_keep,p_remove);
 IF jsonb_array_length(current_preview->'blockers')<>0 THEN RAISE EXCEPTION 'merge_blocked' USING ERRCODE='P0001'; END IF;
 IF current_preview->>'fingerprint' IS DISTINCT FROM p_preview THEN RAISE EXCEPTION 'merge_stale' USING ERRCODE='P0001'; END IF;
 FOR link IN SELECT * FROM public.wb_customer_merge_links() WHERE handling IN('move','revoke') LOOP
   IF link.handling='move' THEN EXECUTE format('UPDATE %I.%I SET %I=$1 WHERE %I=$2',link.schema_name,link.table_name,link.column_name,link.column_name) USING p_keep,p_remove;
   ELSE EXECUTE format('DELETE FROM %I.%I WHERE %I=$1',link.schema_name,link.table_name,link.column_name) USING p_remove; END IF;
 END LOOP;
 INSERT INTO public.beauty_customer_merges(request_id,kept_id,removed_id,preview_hash,kept_email,removed_email,moved)
 VALUES(p_request,p_keep,p_remove,p_preview,current_preview#>>'{keep,email}',current_preview#>>'{remove,email}',current_preview->'moves');
 DELETE FROM public.customers WHERE id=p_remove;
 RETURN jsonb_build_object('keptId',p_keep,'removedId',p_remove,'replayed',false);
END $fn$`,
`REVOKE ALL ON FUNCTION public.wb_customer_merge_links() FROM PUBLIC`,
`REVOKE ALL ON FUNCTION public.wb_customer_merge_preview(integer,integer) FROM PUBLIC`,
`REVOKE ALL ON FUNCTION public.wb_customer_merge_execute(uuid,integer,integer,text) FROM PUBLIC`,
];

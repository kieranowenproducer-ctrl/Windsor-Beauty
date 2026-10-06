-- Root only, separately reviewed: use one explicit transaction and the verified Glow runtime binding.
DO $$ BEGIN
  IF current_user <> 'neondb_owner' OR current_schema() <> 'public'
     OR to_regclass('public.beauty_member_changeover_deliveries') IS NULL THEN
    RAISE EXCEPTION 'Unexpected member notice rollback target';
  END IF;
END $$;
LOCK TABLE public.beauty_member_changeover_deliveries IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.beauty_member_changeover_deliveries) THEN
    RAISE EXCEPTION 'Retain used member notice ledger; no drop/reinstall or send replay';
  END IF;
END $$;
DROP TABLE public.beauty_member_changeover_deliveries RESTRICT;

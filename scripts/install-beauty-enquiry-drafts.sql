-- Additive, explicitly installed before publishing. Never applied by a GET.
CREATE TABLE IF NOT EXISTS beauty_enquiry_reply_drafts (
  enquiry_id INTEGER PRIMARY KEY REFERENCES enquiries(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  base_reply_id INTEGER NOT NULL DEFAULT 0,
  payload JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION wb_save_enquiry_reply_draft(p_id INTEGER,p_revision INTEGER,p_reply INTEGER,p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE current_revision INTEGER; latest_reply INTEGER; result JSONB;
BEGIN
  PERFORM id FROM enquiries WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COALESCE(max(id),0) INTO latest_reply FROM enquiry_replies WHERE enquiry_id=p_id;
  IF latest_reply <> p_reply THEN RETURN NULL; END IF;
  INSERT INTO beauty_enquiry_reply_drafts(enquiry_id) VALUES(p_id) ON CONFLICT DO NOTHING;
  SELECT revision INTO current_revision FROM beauty_enquiry_reply_drafts WHERE enquiry_id=p_id FOR UPDATE;
  IF current_revision <> p_revision THEN RETURN NULL; END IF;
  UPDATE beauty_enquiry_reply_drafts SET payload=p_payload,revision=revision+1,base_reply_id=p_reply,updated_at=now()
    WHERE enquiry_id=p_id RETURNING to_jsonb(beauty_enquiry_reply_drafts.*) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION wb_save_enquiry_reply_draft(INTEGER,INTEGER,INTEGER,JSONB) FROM PUBLIC;
-- Function owner (Beauty's application owner role) retains execution rights.

CREATE OR REPLACE FUNCTION wb_record_beauty_draft_reply(p_id INTEGER,p_body TEXT,p_from TEXT,p_provider TEXT,p_base INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE result JSONB; latest_reply INTEGER;
BEGIN
  PERFORM id FROM enquiries WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT to_jsonb(r) INTO result FROM enquiry_replies r WHERE r.enquiry_id=p_id AND r.provider_message_id=p_provider AND r.direction='out' LIMIT 1;
  IF result IS NOT NULL THEN RETURN result; END IF;
  SELECT COALESCE(max(id),0) INTO latest_reply FROM enquiry_replies WHERE enquiry_id=p_id;
  INSERT INTO enquiry_replies(enquiry_id,body,from_address,provider_message_id,direction)
    VALUES(p_id,p_body,p_from,p_provider,'out') RETURNING to_jsonb(enquiry_replies.*) INTO result;
  UPDATE enquiries SET status=CASE WHEN latest_reply>p_base THEN 'new' ELSE 'closed' END,updated_at=now() WHERE id=p_id;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION wb_record_beauty_draft_reply(INTEGER,TEXT,TEXT,TEXT,INTEGER) FROM PUBLIC;

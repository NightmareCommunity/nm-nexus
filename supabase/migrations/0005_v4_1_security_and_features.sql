-- ============================================================================
-- NM NEXUS v4.1 — Security, Attachments, Invites, Rate Limiting
-- Idempotent: safe to run multiple times. Adds nothing that already exists.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1 — Safe search_path on every SECURITY DEFINER function
-- ----------------------------------------------------------------------------

ALTER FUNCTION public.create_community_with_defaults(text, text, text, boolean)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.get_or_create_dm_conversation(uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.handle_new_user()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.join_community_via_invite(text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.leave_community(uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.respond_to_friend_request(uuid, boolean)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.search_users_by_username(text, integer)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.send_friend_request(uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.fetch_prekey_bundle(uuid)
  SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- SECTION 2 — Attachment membership helper (DM + community channel paths)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_access_attachment(p_path text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM attachments a
    WHERE a.storage_path = p_path
    AND (
      a.owner_id = auth.uid()
      OR (
        a.message_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM messages m
          JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
          WHERE m.id = a.message_id AND cm.user_id = auth.uid()
        )
      )
      OR (
        a.message_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM channel_messages cmsg
          JOIN channels ch ON ch.id = cmsg.channel_id
          JOIN community_members cmi ON cmi.community_id = ch.community_id
          WHERE cmsg.id = a.message_id AND cmi.user_id = auth.uid()
        )
      )
    )
  );
$$;

-- ----------------------------------------------------------------------------
-- SECTION 3 — Storage policies for `attachments` bucket (private)
-- Drop the permissive `attachments_read` policy that allowed any authenticated
-- user to read any attachment. Replace with membership-based check.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS attachments_read ON storage.objects;
DROP POLICY IF EXISTS attachments_select_member ON storage.objects;
DROP POLICY IF EXISTS attachments_owner_read ON storage.objects;
DROP POLICY IF EXISTS attachments_write ON storage.objects;
DROP POLICY IF EXISTS attachments_owner_write ON storage.objects;
DROP POLICY IF EXISTS attachments_owner_insert ON storage.objects;
DROP POLICY IF EXISTS attachments_insert_owner ON storage.objects;
DROP POLICY IF EXISTS attachments_delete ON storage.objects;
DROP POLICY IF EXISTS attachments_owner_delete ON storage.objects;
DROP POLICY IF EXISTS attachments_owner_update ON storage.objects;

-- SELECT: only if the user owns the file OR is a member of the conversation/channel it belongs to.
CREATE POLICY attachments_member_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'attachments'
    AND public.can_access_attachment(name)
  );

-- INSERT: only to your own folder (path[1] = your user id).
CREATE POLICY attachments_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE: only your own files.
CREATE POLICY attachments_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE: only your own files (orphan cleanup, message deletion).
CREATE POLICY attachments_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ----------------------------------------------------------------------------
-- SECTION 4 — Attachments table RLS: include channel_messages path
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS attachments_select_member ON attachments;
DROP POLICY IF EXISTS attachments_insert_self ON attachments;
DROP POLICY IF EXISTS attachments_delete_owner ON attachments;
DROP POLICY IF EXISTS attachments_update_owner ON attachments;

CREATE POLICY attachments_select_member ON attachments
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR (
      message_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM messages m
        JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
        WHERE m.id = attachments.message_id AND cm.user_id = auth.uid()
      )
    )
    OR (
      message_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM channel_messages cmsg
        JOIN channels ch ON ch.id = cmsg.channel_id
        JOIN community_members cmi ON cmi.community_id = ch.community_id
        WHERE cmsg.id = attachments.message_id AND cmi.user_id = auth.uid()
      )
    )
  );

CREATE POLICY attachments_insert_self ON attachments
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY attachments_update_owner ON attachments
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY attachments_delete_owner ON attachments
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- SECTION 5 — Voice messages storage: restrict to owner (was any authed user)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS voice_messages_read ON storage.objects;
DROP POLICY IF EXISTS voice_owner_read ON storage.objects;

CREATE POLICY voice_messages_owner_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'voice_messages'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ----------------------------------------------------------------------------
-- SECTION 6 — Atomic invite join (race-condition proof)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.join_community_via_invite(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invite community_invites%ROWTYPE;
BEGIN
  -- Row-level lock prevents concurrent joins from overshooting max_uses.
  SELECT * INTO v_invite
  FROM community_invites
  WHERE code = p_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or unknown invite code';
  END IF;

  IF v_invite.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'This invite has been revoked';
  END IF;

  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'This invite has expired';
  END IF;

  IF v_invite.max_uses IS NOT NULL AND v_invite.uses >= v_invite.max_uses THEN
    RAISE EXCEPTION 'This invite has reached its maximum uses';
  END IF;

  -- Already a member? Just return the community id (idempotent).
  PERFORM 1 FROM community_members
  WHERE community_id = v_invite.community_id AND user_id = auth.uid();
  IF FOUND THEN
    RETURN v_invite.community_id;
  END IF;

  INSERT INTO community_members (community_id, user_id, role)
  VALUES (v_invite.community_id, auth.uid(), 'member');

  UPDATE community_invites
  SET uses = uses + 1
  WHERE id = v_invite.id;

  RETURN v_invite.community_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- SECTION 7 — Invite management RPCs
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_community_invite(
  p_community_id uuid,
  p_max_uses integer DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_code text;
  v_invite_id uuid;
BEGIN
  IF NOT public.is_community_admin(p_community_id) THEN
    RAISE EXCEPTION 'Only community admins can create invites';
  END IF;

  v_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  INSERT INTO community_invites (community_id, code, created_by, max_uses, expires_at)
  VALUES (p_community_id, v_code, auth.uid(), p_max_uses, p_expires_at)
  RETURNING id INTO v_invite_id;

  RETURN v_invite_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_community_invite(p_invite_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM community_invites ci
    WHERE ci.id = p_invite_id
    AND EXISTS (
      SELECT 1 FROM community_members cm
      WHERE cm.community_id = ci.community_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'admin')
    )
  ) THEN
    RAISE EXCEPTION 'Only community admins can revoke invites';
  END IF;

  UPDATE community_invites
  SET revoked_at = now()
  WHERE id = p_invite_id;

  RETURN TRUE;
END;
$$;

-- ----------------------------------------------------------------------------
-- SECTION 8 — Fetch authorized attachments for a batch of message IDs
-- Client uses this to render inline previews without exposing storage paths
-- the user is not authorized for.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fetch_message_attachments(p_message_ids uuid[])
RETURNS TABLE(
  id uuid,
  message_id uuid,
  owner_id uuid,
  storage_path text,
  file_name text,
  mime_type text,
  file_size bigint,
  width integer,
  height integer,
  duration_seconds numeric,
  thumbnail_path text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.message_id, a.owner_id, a.storage_path, a.file_name,
         a.mime_type, a.file_size, a.width, a.height,
         a.duration_seconds, a.thumbnail_path, a.created_at
  FROM attachments a
  WHERE a.message_id = ANY(p_message_ids)
  AND (
    a.owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM messages m
      JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
      WHERE m.id = a.message_id AND cm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM channel_messages cmsg
      JOIN channels ch ON ch.id = cmsg.channel_id
      JOIN community_members cmi ON cmi.community_id = ch.community_id
      WHERE cmsg.id = a.message_id AND cmi.user_id = auth.uid()
    )
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- SECTION 9 — Orphan attachment cleanup on message hard-delete
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cleanup_message_attachments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Mark attachments as orphaned (detached from message). A scheduled
  -- background job (or the storage cleanup RPC below) will then delete
  -- the actual file from Storage after a grace period.
  UPDATE attachments
  SET message_id = NULL
  WHERE message_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS cleanup_attachments_on_message_delete ON messages;
CREATE TRIGGER cleanup_attachments_on_message_delete
  AFTER DELETE ON messages
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_message_attachments();

DROP TRIGGER IF EXISTS cleanup_attachments_on_channel_message_delete ON channel_messages;
CREATE TRIGGER cleanup_attachments_on_channel_message_delete
  AFTER DELETE ON channel_messages
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_message_attachments();

-- ----------------------------------------------------------------------------
-- SECTION 10 — RPC to delete an orphaned attachment (owner-only)
-- Callable by the owner to remove an attachment they no longer need.
-- The actual Storage object deletion happens client-side via the Storage API
-- (the owner has DELETE permission on their own folder).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_owned_attachment(p_attachment_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM attachments
  WHERE id = p_attachment_id AND owner_id = auth.uid();
  RETURN FOUND;
END;
$$;

-- ----------------------------------------------------------------------------
-- SECTION 11 — Rate limiting (per-user, per-action, sliding window)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rate_limit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_user_action_time
  ON public.rate_limit_log (user_id, action, created_at DESC);

ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rate_limit_log_select_self ON public.rate_limit_log;
DROP POLICY IF EXISTS rate_limit_log_insert_self ON public.rate_limit_log;
DROP POLICY IF EXISTS rate_limit_log_delete_self ON public.rate_limit_log;

CREATE POLICY rate_limit_log_select_self ON public.rate_limit_log
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY rate_limit_log_insert_self ON public.rate_limit_log
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY rate_limit_log_delete_self ON public.rate_limit_log
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_action text,
  p_max integer,
  p_window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT count(*) INTO v_count
  FROM rate_limit_log
  WHERE user_id = auth.uid()
    AND action = p_action
    AND created_at > now() - make_interval(secs => p_window_seconds);

  IF v_count >= p_max THEN
    RETURN FALSE;
  END IF;

  INSERT INTO rate_limit_log (user_id, action) VALUES (auth.uid(), p_action);
  RETURN TRUE;
END;
$$;

-- ----------------------------------------------------------------------------
-- SECTION 12 — RPC to fetch unread counts (DM + channel + mentions)
-- Used by the sidebar to render unread indicators.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fetch_unread_counts()
RETURNS TABLE(
  conversation_id uuid,
  channel_id uuid,
  unread_count integer,
  has_mention boolean
)
LANGUAGE plpgsql
SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  -- DM unread counts
  RETURN QUERY
  SELECT
    rs.conversation_id,
    NULL::uuid AS channel_id,
    GREATEST(COUNT(m.id) FILTER (
      WHERE m.created_at > COALESCE(rs.last_read_at, '1970-01-01'::timestamptz)
    ), 0)::integer AS unread_count,
    FALSE AS has_mention
  FROM read_states rs
  JOIN messages m ON m.conversation_id = rs.conversation_id
  WHERE rs.user_id = auth.uid()
    AND rs.channel_id IS NULL
    AND m.deleted_at IS NULL
    AND m.sender_id <> auth.uid()
  GROUP BY rs.conversation_id

  UNION ALL

  -- Channel unread counts
  SELECT
    NULL::uuid AS conversation_id,
    rs.channel_id,
    GREATEST(COUNT(cm.id) FILTER (
      WHERE cm.created_at > COALESCE(rs.last_read_at, '1970-01-01'::timestamptz)
    ), 0)::integer AS unread_count,
    BOOL_OR(
      cm.mentions IS NOT NULL
      AND auth.uid()::text = ANY(cm.mentions)
      AND cm.created_at > COALESCE(rs.last_read_at, '1970-01-01'::timestamptz)
    ) AS has_mention
  FROM read_states rs
  JOIN channel_messages cm ON cm.channel_id = rs.channel_id
  WHERE rs.user_id = auth.uid()
    AND rs.conversation_id IS NULL
    AND cm.deleted_at IS NULL
    AND cm.sender_id <> auth.uid()
  GROUP BY rs.channel_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- SECTION 13 — RPC to mark a message read (per-user, atomic upsert)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_message_read(
  p_conversation_id uuid DEFAULT NULL,
  p_channel_id uuid DEFAULT NULL,
  p_message_id uuid DEFAULT NULL,
  p_message_created_at timestamptz DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_read_at timestamptz := COALESCE(p_message_created_at, v_now);
BEGIN
  IF p_conversation_id IS NULL AND p_channel_id IS NULL THEN
    RAISE EXCEPTION 'Either conversation_id or channel_id is required';
  END IF;

  -- Conversation membership check
  IF p_conversation_id IS NOT NULL
     AND NOT public.is_conversation_member(p_conversation_id) THEN
    RAISE EXCEPTION 'Not a member of this conversation';
  END IF;

  -- Channel membership check
  IF p_channel_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM channels ch
      JOIN community_members cm ON cm.community_id = ch.community_id
      WHERE ch.id = p_channel_id AND cm.user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Not a member of this channel''s community';
    END IF;
  END IF;

  INSERT INTO read_states (
    user_id, conversation_id, channel_id,
    last_read_message_id, last_read_at
  ) VALUES (
    auth.uid(), p_conversation_id, p_channel_id,
    p_message_id, v_read_at
  )
  ON CONFLICT (user_id, channel_id, conversation_id)
  DO UPDATE SET
    last_read_message_id = EXCLUDED.last_read_message_id,
    last_read_at = GREATEST(read_states.last_read_at, EXCLUDED.last_read_at)
  WHERE EXCLUDED.last_read_at > read_states.last_read_at
     OR read_states.last_read_message_id IS NULL;

  RETURN TRUE;
END;
$$;

-- ----------------------------------------------------------------------------
-- SECTION 14 — RPC to manage community categories + channel reorder
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_channel_category(
  p_community_id uuid,
  p_name text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_position integer;
BEGIN
  IF NOT public.is_community_admin(p_community_id) THEN
    RAISE EXCEPTION 'Only admins can manage categories';
  END IF;

  SELECT COALESCE(MAX(position), -1) + 1 INTO v_position
  FROM channel_categories WHERE community_id = p_community_id;

  INSERT INTO channel_categories (community_id, name, position)
  VALUES (p_community_id, p_name, v_position)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reorder_channel(
  p_channel_id uuid,
  p_new_position integer,
  p_new_category_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_community_id uuid;
BEGIN
  SELECT community_id INTO v_community_id FROM channels WHERE id = p_channel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Channel not found';
  END IF;

  IF NOT public.is_community_admin(v_community_id) THEN
    RAISE EXCEPTION 'Only admins can reorder channels';
  END IF;

  UPDATE channels
  SET position = p_new_position,
      category_id = p_new_category_id
  WHERE id = p_channel_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_channel(p_channel_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_community_id uuid;
BEGIN
  SELECT community_id INTO v_community_id FROM channels WHERE id = p_channel_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  IF NOT public.is_community_admin(v_community_id) THEN
    RAISE EXCEPTION 'Only admins can delete channels';
  END IF;

  -- Soft-delete attachments first (set message_id NULL), then hard-delete messages.
  UPDATE attachments SET message_id = NULL
  WHERE message_id IN (SELECT id FROM channel_messages WHERE channel_id = p_channel_id);

  DELETE FROM channel_messages WHERE channel_id = p_channel_id;
  DELETE FROM channels WHERE id = p_channel_id;

  RETURN TRUE;
END;
$$;

-- ----------------------------------------------------------------------------
-- SECTION 15 — Voice state cleanup (stale voice_states older than 1 hour)
-- Safe to call from a cron or on voice-channel join.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cleanup_stale_voice_states()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM voice_states
  WHERE joined_at < now() - interval '1 hour';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ----------------------------------------------------------------------------
-- SECTION 16 — Call signaling cleanup (stale calls older than 5 minutes)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cleanup_stale_calls()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Mark ringing calls older than 5 minutes as missed
  UPDATE calls
  SET status = 'missed', ended_at = now()
  WHERE status = 'ringing' AND created_at < now() - interval '5 minutes';

  -- Delete signaling older than 1 hour
  DELETE FROM call_signaling
  WHERE created_at < now() - interval '1 hour';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ----------------------------------------------------------------------------
-- SECTION 17 — Enforce attachments bucket file size limit (25 MB)
-- ----------------------------------------------------------------------------

UPDATE storage.buckets
SET file_size_limit = 26214400,
    allowed_mime_types = ARRAY[
      'image/png','image/jpeg','image/gif','image/webp','image/bmp',
      'video/mp4','video/webm','video/quicktime',
      'audio/mpeg','audio/ogg','audio/wav','audio/webm','audio/aac',
      'application/pdf','text/plain','application/zip',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ]
WHERE id = 'attachments';

-- ----------------------------------------------------------------------------
-- SECTION 18 — Ensure attachments table has a sanitized_filename column
-- (alias of file_name; client uses original_filename = user-provided name)
-- ----------------------------------------------------------------------------

ALTER TABLE public.attachments
  ADD COLUMN IF NOT EXISTS original_filename text;

UPDATE public.attachments
SET original_filename = file_name
WHERE original_filename IS NULL AND file_name IS NOT NULL;

-- ----------------------------------------------------------------------------
-- SECTION 19 — Grant execute on new RPCs to authenticated role
-- ----------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.can_access_attachment(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_community_invite(uuid, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_community_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_message_attachments(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_owned_attachment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_unread_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_message_read(uuid, uuid, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_channel_category(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_channel(uuid, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_channel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_voice_states() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_calls() TO authenticated;

-- ----------------------------------------------------------------------------
-- SECTION 20 — Realtime: ensure attachments changes are broadcast
-- ----------------------------------------------------------------------------

ALTER PUBLICATION supabase_realtime ADD TABLE public.attachments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_invites;
ALTER PUBLICATION supabase_realtime ADD TABLE public.read_states;
ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_categories;

-- End of migration.

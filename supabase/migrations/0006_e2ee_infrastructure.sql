-- ============================================================================
-- NM NEXUS v4.2 — E2EE Infrastructure (Honest Prep, NOT Wired to Chat Flow)
-- ----------------------------------------------------------------------------
-- This migration adds the backend storage layer required by the planned
-- Signal-protocol-inspired E2EE module (src/lib/crypto/e2ee.ts).
--
-- STATUS: This migration DOES NOT change how messages are stored or read.
-- Messages continue to be stored as plaintext_body protected by TLS + RLS.
-- The tables below store ONLY PUBLIC key material — never private keys.
-- Private keys remain device-local (browser localStorage), as documented in
-- src/lib/crypto/e2ee.ts.
--
-- Why ship this now?
--   - So the crypto module can be wired in a FUTURE major version without
--     requiring a separate schema migration.
--   - So users can publish their device key bundle ahead of time, allowing
--     existing accounts to opt into E2EE once it ships.
--   - So security auditors can review the storage model independently.
--
-- All SECURITY DEFINER functions here use:
--   - search_path = public, pg_temp
--   - explicit auth.uid() validation
--   - no privilege escalation
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1 — Device key bundles (public identity + signed prekey)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.device_key_bundles (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- One active bundle per user for now. Multi-device support is a future
  -- enhancement (will require (user_id, device_id) PK + a separate table).
  identity_public_key      text NOT NULL,
  signed_prekey_public     text NOT NULL,
  signed_prekey_signature  text NOT NULL,
  -- 50 one-time prekeys pre-uploaded. Each is consumed by exactly one session.
  -- Server stores only the public half; private half never leaves the device.
  one_time_prekeys         jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- When one_time_prekeys runs low, client uploads a fresh batch via RPC.
  published_at   timestamptz NOT NULL DEFAULT now(),
  rotated_at     timestamptz
);

ALTER TABLE public.device_key_bundles ENABLE ROW LEVEL SECURITY;

-- Users can read their OWN bundle (private half is in localStorage; the public
-- half is here so they can verify it).
DROP POLICY IF EXISTS device_key_bundles_self_read ON public.device_key_bundles;
CREATE POLICY device_key_bundles_self_read ON public.device_key_bundles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can read OTHER users' bundles — this is required for E2EE key exchange.
-- Only PUBLIC material is exposed here. Private keys never live in this table.
DROP POLICY IF EXISTS device_key_bundles_public_read ON public.device_key_bundles;
CREATE POLICY device_key_bundles_public_read ON public.device_key_bundles
  FOR SELECT TO authenticated
  USING (true);

-- Users can insert / update only their OWN bundle.
DROP POLICY IF EXISTS device_key_bundles_self_write ON public.device_key_bundles;
CREATE POLICY device_key_bundles_self_write ON public.device_key_bundles
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- SECTION 2 — Consumed prekeys audit log (so we can debug key exhaustion)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.consumed_prekeys (
  id              bigserial PRIMARY KEY,
  consumer_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  producer_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consumed_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.consumed_prekeys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consumed_prekeys_self_read ON public.consumed_prekeys;
CREATE POLICY consumed_prekeys_self_read ON public.consumed_prekeys
  FOR SELECT TO authenticated
  USING (consumer_id = auth.uid() OR producer_id = auth.uid());

-- ----------------------------------------------------------------------------
-- SECTION 3 — publish_device_keys RPC
-- ----------------------------------------------------------------------------
-- Called by the client after generating a fresh device key bundle locally.
-- Atomically replaces any existing bundle for this user (key rotation).
-- Returns the new bundle's published_at timestamp for client confirmation.

CREATE OR REPLACE FUNCTION public.publish_device_keys(
  p_identity_public_key     text,
  p_signed_prekey_public    text,
  p_signed_prekey_signature text,
  p_one_time_prekeys        jsonb
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_published_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_identity_public_key IS NULL OR length(p_identity_public_key) < 16 THEN
    RAISE EXCEPTION 'Invalid identity_public_key';
  END IF;
  IF p_signed_prekey_public IS NULL OR length(p_signed_prekey_public) < 16 THEN
    RAISE EXCEPTION 'Invalid signed_prekey_public';
  END IF;
  IF p_signed_prekey_signature IS NULL OR length(p_signed_prekey_signature) < 16 THEN
    RAISE EXCEPTION 'Invalid signed_prekey_signature';
  END IF;
  IF jsonb_array_length(p_one_time_prekeys) > 200 THEN
    RAISE EXCEPTION 'Too many one-time prekeys (max 200)';
  END IF;

  INSERT INTO public.device_key_bundles (
    user_id, identity_public_key, signed_prekey_public,
    signed_prekey_signature, one_time_prekeys, published_at
  )
  VALUES (
    auth.uid(), p_identity_public_key, p_signed_prekey_public,
    p_signed_prekey_signature, p_one_time_prekeys, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    identity_public_key     = EXCLUDED.identity_public_key,
    signed_prekey_public    = EXCLUDED.signed_prekey_public,
    signed_prekey_signature = EXCLUDED.signed_prekey_signature,
    one_time_prekeys        = EXCLUDED.one_time_prekeys,
    published_at            = now(),
    rotated_at              = now()
  RETURNING published_at INTO v_published_at;

  RETURN v_published_at;
END;
$$;

-- ----------------------------------------------------------------------------
-- SECTION 4 — fetch_prekey_bundle RPC (was stubbed in 0005; now implemented)
-- ----------------------------------------------------------------------------
-- Returns the recipient's PUBLIC identity key, signed prekey, signature, and
-- ATOMICALLY pops one one-time prekey off the queue. The popped prekey is
-- logged in consumed_prekeys for audit. Returns NULL one_time_prekey if the
-- recipient has run out (the protocol gracefully falls back to signed prekey
-- only — see X3DH specification).

-- Drop the existing stub (0005 had a placeholder with different signature).
DROP FUNCTION IF EXISTS public.fetch_prekey_bundle(uuid);

CREATE OR REPLACE FUNCTION public.fetch_prekey_bundle(p_recipient_id uuid)
RETURNS TABLE(
  identity_key           text,
  signed_prekey          text,
  signed_prekey_sig      text,
  one_time_prekey        text,
  device_id              uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bundle     public.device_key_bundles%ROWTYPE;
  v_otpk       text;
  v_remaining  jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_recipient_id IS NULL OR p_recipient_id = auth.uid() THEN
    RAISE EXCEPTION 'Invalid recipient';
  END IF;

  -- Lock the row to prevent two callers getting the same one-time prekey.
  SELECT * INTO v_bundle
  FROM public.device_key_bundles
  WHERE user_id = p_recipient_id
  FOR UPDATE;

  IF NOT FOUND THEN
    identity_key := NULL;
    signed_prekey := NULL;
    signed_prekey_sig := NULL;
    one_time_prekey := NULL;
    device_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Atomic pop: peel off the first one-time prekey (a base64 string),
  -- shift the rest down, and log the consumption.
  IF jsonb_array_length(v_bundle.one_time_prekeys) > 0 THEN
    v_otpk      := (v_bundle.one_time_prekeys->0)->>'public';
    v_remaining := (v_bundle.one_time_prekeys - 0);

    UPDATE public.device_key_bundles
    SET one_time_prekeys = v_remaining
    WHERE user_id = p_recipient_id;

    INSERT INTO public.consumed_prekeys (consumer_id, producer_id)
    VALUES (auth.uid(), p_recipient_id);
  ELSE
    v_otpk := NULL;
  END IF;

  identity_key      := v_bundle.identity_public_key;
  signed_prekey     := v_bundle.signed_prekey_public;
  signed_prekey_sig := v_bundle.signed_prekey_signature;
  one_time_prekey   := v_otpk;
  device_id         := p_recipient_id;

  RETURN NEXT;
  RETURN;
END;
$$;

-- ----------------------------------------------------------------------------
-- SECTION 5 — replenish_one_time_prekeys RPC
-- ----------------------------------------------------------------------------
-- Called by the client when the server-side queue runs low (e.g. < 10 left).
-- Atomically appends new prekeys without disturbing the existing identity.

CREATE OR REPLACE FUNCTION public.replenish_one_time_prekeys(p_new_prekeys jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF jsonb_array_length(p_new_prekeys) > 200 THEN
    RAISE EXCEPTION 'Too many new prekeys (max 200)';
  END IF;

  UPDATE public.device_key_bundles
  SET one_time_prekeys = one_time_prekeys || p_new_prekeys
  WHERE user_id = auth.uid()
  RETURNING jsonb_array_length(one_time_prekeys) INTO v_count;

  IF v_count IS NULL THEN
    RAISE EXCEPTION 'No device_key_bundles row for this user — call publish_device_keys first';
  END IF;

  RETURN v_count;
END;
$$;

-- ----------------------------------------------------------------------------
-- SECTION 6 — revoke_device_keys RPC
-- ----------------------------------------------------------------------------
-- Used by Settings → Security → Rotate Keys. Marks the bundle as rotated and
-- removes all one-time prekeys so no new sessions can be established. Existing
-- sessions (which already have derived keys) are unaffected.

CREATE OR REPLACE FUNCTION public.revoke_device_keys()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.device_key_bundles
  SET
    one_time_prekeys = '[]'::jsonb,
    rotated_at       = now()
  WHERE user_id = auth.uid();

  RETURN FOUND;
END;
$$;

-- ----------------------------------------------------------------------------
-- SECTION 7 — get_my_device_bundle_status RPC
-- ----------------------------------------------------------------------------
-- Returns the user's own bundle status (count of remaining one-time prekeys,
-- last published/rotated timestamps) for display in Settings → Security.

CREATE OR REPLACE FUNCTION public.get_my_device_bundle_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bundle public.device_key_bundles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_bundle
  FROM public.device_key_bundles
  WHERE user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('has_bundle', false);
  END IF;

  RETURN jsonb_build_object(
    'has_bundle',             true,
    'published_at',           v_bundle.published_at,
    'rotated_at',             v_bundle.rotated_at,
    'remaining_one_time_prekeys', jsonb_array_length(v_bundle.one_time_prekeys)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- SECTION 8 — Realtime publication (so clients see bundle changes live)
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'device_key_bundles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.device_key_bundles;
  END IF;
END $$;

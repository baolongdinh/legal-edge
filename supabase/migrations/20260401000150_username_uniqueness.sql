-- ============================================================
-- LegalShield: Username Uniqueness & Sync Update
-- Adds username column to public.users and updates sync trigger
-- ============================================================

-- 1. Add username column if not exists
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='username') THEN
    ALTER TABLE public.users ADD COLUMN username TEXT;
  END IF;
END $$;

-- 2. Add unique constraint on username
-- Note: This might fail if there are existing nulls or duplicates. 
-- In a fresh setup, it's safe.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_username_key;
ALTER TABLE public.users ADD CONSTRAINT users_username_key UNIQUE (username);

-- 3. Update sync function to handle username
CREATE OR REPLACE FUNCTION public.handle_auth_user_sync()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url, username)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url',
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url,
    username = EXCLUDED.username;
    
  -- Initialize free subscription if not exists
  INSERT INTO public.subscriptions (user_id, plan, api_calls_limit)
  VALUES (NEW.id, 'free', 10)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

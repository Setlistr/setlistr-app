-- ============================================
-- SETLISTR V1 DATABASE SCHEMA
-- Run this in Supabase SQL Editor
-- ============================================

-- Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'artist' CHECK (role IN ('artist', 'admin')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Venues
CREATE TABLE IF NOT EXISTS venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'United States',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performances
CREATE TABLE IF NOT EXISTS performances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES venues(id),
  venue_name TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'United States',
  artist_name TEXT NOT NULL,
  performance_date DATE NOT NULL,
  start_time TIME NOT NULL DEFAULT '20:00',
  set_duration_minutes INTEGER NOT NULL DEFAULT 60,
  auto_close_buffer_minutes INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live', 'processing', 'review', 'complete')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Capture sessions
CREATE TABLE IF NOT EXISTS capture_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  performance_id UUID NOT NULL REFERENCES performances(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance songs
CREATE TABLE IF NOT EXISTS performance_songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  performance_id UUID NOT NULL REFERENCES performances(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  artist TEXT,
  position INTEGER NOT NULL DEFAULT 1,
  duration_seconds INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attachments
CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  performance_id UUID NOT NULL REFERENCES performances(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE performances ENABLE ROW LEVEL SECURITY;
ALTER TABLE capture_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/write their own
CREATE POLICY "profiles_self" ON profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "profiles_insert_self" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Performances: users can manage their own
CREATE POLICY "performances_own" ON performances FOR ALL USING (auth.uid() = user_id);

-- Capture sessions: via performance ownership
CREATE POLICY "capture_sessions_own" ON capture_sessions FOR ALL
  USING (EXISTS (SELECT 1 FROM performances WHERE id = performance_id AND user_id = auth.uid()));

-- Songs: via performance ownership
CREATE POLICY "songs_own" ON performance_songs FOR ALL
  USING (EXISTS (SELECT 1 FROM performances WHERE id = performance_id AND user_id = auth.uid()));

-- Attachments: via performance ownership
CREATE POLICY "attachments_own" ON attachments FOR ALL
  USING (EXISTS (SELECT 1 FROM performances WHERE id = performance_id AND user_id = auth.uid()));

-- Venues: everyone can read, authenticated can insert
CREATE POLICY "venues_read" ON venues FOR SELECT USING (true);
CREATE POLICY "venues_insert" ON venues FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    'artist'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- STORAGE BUCKET
-- ============================================
-- Run this separately if bucket doesn't exist:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('performance-proofs', 'performance-proofs', true);

CREATE POLICY "proofs_upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'performance-proofs' AND auth.uid() IS NOT NULL);

CREATE POLICY "proofs_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'performance-proofs');

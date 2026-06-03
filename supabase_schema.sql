-- Supabase Schema for MingooLive

-- ============================================
-- 1. USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT,
  firebase_uid TEXT UNIQUE,
  coin_balance INTEGER DEFAULT 1000,
  role TEXT DEFAULT 'user',
  avatar TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  full_name TEXT,
  date_of_birth DATE,
  country TEXT,
  gender TEXT,
  profile_completion INTEGER DEFAULT 0,
  is_banned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Profile fields indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_users_country ON users(country);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_users_updated_at ON users;
CREATE TRIGGER trigger_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_users_updated_at();

-- ============================================
-- 2. STREAMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS streams (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  title TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  type TEXT DEFAULT 'public',
  host_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_live BOOLEAN DEFAULT FALSE,
  viewer_count INTEGER DEFAULT 0,
  livekit_room TEXT,
  thumbnail TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Gifts catalog table
CREATE TABLE IF NOT EXISTS gifts (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  coin_cost INTEGER NOT NULL
);

-- 4. Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  sender_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  receiver_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  gift_id BIGINT REFERENCES gifts(id) ON DELETE SET NULL,
  stream_id BIGINT REFERENCES streams(id) ON DELETE SET NULL,
  gift_name TEXT,
  gift_icon TEXT,
  amount INTEGER NOT NULL,
  type TEXT DEFAULT 'gift',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Withdrawals table
CREATE TABLE IF NOT EXISTS withdrawals (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Stream join requests
CREATE TABLE IF NOT EXISTS stream_requests (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  stream_id BIGINT NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Direct Messages table (Updated for Realtime)
DROP TABLE IF EXISTS messages CASCADE;

CREATE TABLE messages (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  room_id TEXT NOT NULL,
  sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_username TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- Enable Realtime for messages table
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- Enable Row Level Security
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Create public policy for messages (since app uses custom backend auth)
DROP POLICY IF EXISTS "authenticated users can access messages" ON messages;

CREATE POLICY "public users can access messages" 
  ON messages 
  FOR ALL 
  TO public 
  USING (true) 
  WITH CHECK (true);

-- Function to get recent chats for a user
CREATE OR REPLACE FUNCTION get_recent_chats(p_user_id BIGINT)
RETURNS TABLE (
  partner_id BIGINT,
  partner_name TEXT,
  partner_avatar TEXT,
  last_message TEXT,
  "time" TIMESTAMPTZ,
  is_read BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH ranked_messages AS (
    SELECT 
      m.*,
      CASE 
        WHEN SPLIT_PART(m.room_id, '_', 2) = p_user_id::TEXT THEN CAST(SPLIT_PART(m.room_id, '_', 3) AS BIGINT)
        ELSE CAST(SPLIT_PART(m.room_id, '_', 2) AS BIGINT)
      END as partner_id_calc,
      ROW_NUMBER() OVER (
        PARTITION BY m.room_id 
        ORDER BY m.created_at DESC
      ) as rn
    FROM messages m
    WHERE m.room_id LIKE 'chat\_%\_' || p_user_id::TEXT OR m.room_id LIKE 'chat\_' || p_user_id::TEXT || '\_%'
  )
  SELECT 
    rm.partner_id_calc AS partner_id,
    u.username AS partner_name,
    u.avatar AS partner_avatar,
    rm.message AS last_message,
    rm.created_at AS "time",
    TRUE AS is_read -- For simplicity, since we removed is_read from messages
  FROM ranked_messages rm
  JOIN users u ON u.id = rm.partner_id_calc
  WHERE rm.rn = 1
  ORDER BY rm.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Followers table
CREATE TABLE IF NOT EXISTS followers (
  follower_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id)
);

-- Indexes for followers (frequently queried)
CREATE INDEX IF NOT EXISTS idx_followers_follower ON followers(follower_id);
CREATE INDEX IF NOT EXISTS idx_followers_following ON followers(following_id);
CREATE INDEX IF NOT EXISTS idx_followers_created ON followers(created_at DESC);

-- ============================================
-- 9. PRIVATE CALLS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS calls (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  caller_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  call_type TEXT NOT NULL, -- 'audio' or 'video'
  status TEXT DEFAULT 'missed', -- 'completed', 'missed', 'rejected', 'ongoing'
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration INTEGER DEFAULT 0 -- in seconds
);

-- Seed default gifts
INSERT INTO gifts (name, icon, coin_cost) VALUES 
('Rose', '🌹', 10),
('Star', '⭐', 50),
('Diamond', '💎', 200)
ON CONFLICT DO NOTHING;

-- 10. Posts Table
CREATE TABLE IF NOT EXISTS posts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
 username TEXT,
 caption TEXT,
 media_type TEXT,
 media_url TEXT,
 thumbnail_url TEXT,
 location TEXT,
 visibility TEXT DEFAULT 'public',
 created_at TIMESTAMPTZ DEFAULT NOW(),
 updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Post Hashtags Table
CREATE TABLE IF NOT EXISTS post_hashtags (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
 hashtag TEXT
);

-- 12. Post Likes Table
CREATE TABLE IF NOT EXISTS post_likes (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
 user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ DEFAULT NOW(),
 UNIQUE(post_id, user_id)
);

-- 13. Post Comments Table
CREATE TABLE IF NOT EXISTS post_comments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
 user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
 comment TEXT,
 created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. Post Saves Table
CREATE TABLE IF NOT EXISTS post_saves (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
 user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ DEFAULT NOW(),
 UNIQUE(post_id, user_id)
);

-- 15. Gifts Received Table
CREATE TABLE IF NOT EXISTS gifts_received (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 receiver_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
 sender_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
 gift_name TEXT,
 gift_image TEXT,
 coin_value INTEGER,
 created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for gifts_received (for fan count queries)
CREATE INDEX IF NOT EXISTS idx_gifts_received_receiver ON gifts_received(receiver_id);
CREATE INDEX IF NOT EXISTS idx_gifts_received_created ON gifts_received(created_at DESC);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to calculate profile completion percentage
CREATE OR REPLACE FUNCTION calculate_profile_completion(user_id BIGINT)
RETURNS INTEGER AS $$
DECLARE
  completion INTEGER := 0;
  user_data users;
BEGIN
  SELECT * INTO user_data FROM users WHERE id = user_id;
  IF user_data.username IS NOT NULL AND length(user_data.username) >= 3 THEN completion := completion + 20; END IF;
  IF user_data.avatar IS NOT NULL AND length(user_data.avatar) > 0 THEN completion := completion + 20; END IF;
  IF user_data.bio IS NOT NULL AND length(user_data.bio) > 0 THEN completion := completion + 20; END IF;
  IF user_data.full_name IS NOT NULL AND length(user_data.full_name) > 0 THEN completion := completion + 20; END IF;
  IF user_data.date_of_birth IS NOT NULL OR user_data.country IS NOT NULL OR user_data.gender IS NOT NULL THEN
    completion := completion + 20;
  END IF;
  RETURN completion;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to retrieve detailed user profile stats in a single optimized query
DROP FUNCTION IF EXISTS get_user_profile(bigint);
CREATE OR REPLACE FUNCTION get_user_profile(p_user_id BIGINT)
RETURNS TABLE (
  id BIGINT,
  username TEXT,
  full_name TEXT,
  avatar TEXT,
  bio TEXT,
  coin_balance INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  country TEXT,
  gender TEXT,
  date_of_birth DATE,
  followers_count BIGINT,
  following_count BIGINT,
  posts_count BIGINT,
  fans_count BIGINT,
  gifts_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.username,
    u.full_name,
    u.avatar,
    u.bio,
    u.coin_balance,
    u.created_at,
    u.updated_at,
    u.country,
    u.gender,
    u.date_of_birth,
    (SELECT COUNT(*) FROM followers WHERE following_id = u.id) AS followers_count,
    (SELECT COUNT(*) FROM followers WHERE follower_id = u.id) AS following_count,
    (SELECT COUNT(*) FROM posts WHERE user_id = u.id) AS posts_count,
    (SELECT COUNT(DISTINCT sender_id) FROM gifts_received WHERE receiver_id = u.id) AS fans_count,
    (SELECT COUNT(*) FROM gifts_received WHERE receiver_id = u.id) AS gifts_count
  FROM users u
  WHERE u.id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 16. POSTS TABLE INDEXES & POLICIES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_visibility ON posts(visibility);

-- ============================================
-- 17. RLS POLICIES
-- ============================================
ALTER TABLE posts ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE gifts_received ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 17. RLS POLICIES
-- ============================================
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE gifts_received ENABLE ROW LEVEL SECURITY;

-- Public read policies
DROP POLICY IF EXISTS "Public read posts" ON posts;
CREATE POLICY "Public read posts" ON posts FOR SELECT USING (visibility = 'public');

DROP POLICY IF EXISTS "Public read likes" ON post_likes;
CREATE POLICY "Public read likes" ON post_likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read comments" ON post_comments;
CREATE POLICY "Public read comments" ON post_comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read saves" ON post_saves;
CREATE POLICY "Public read saves" ON post_saves FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read gifts" ON gifts_received;
CREATE POLICY "Public read gifts" ON gifts_received FOR SELECT USING (true);

-- Backend-only write policies (Express handles auth via JWT)
DROP POLICY IF EXISTS "Backend posts" ON posts;
CREATE POLICY "Backend posts" ON posts FOR ALL USING (true);

DROP POLICY IF EXISTS "Backend likes" ON post_likes;
CREATE POLICY "Backend likes" ON post_likes FOR ALL USING (true);

DROP POLICY IF EXISTS "Backend comments" ON post_comments;
CREATE POLICY "Backend comments" ON post_comments FOR ALL USING (true);

DROP POLICY IF EXISTS "Backend saves" ON post_saves;
CREATE POLICY "Backend saves" ON post_saves FOR ALL USING (true);

DROP POLICY IF EXISTS "Backend gifts" ON gifts_received;
CREATE POLICY "Backend gifts" ON gifts_received FOR ALL USING (true);

-- ============================================
-- 18. TRIGGERS FOR UPDATED_AT
-- ============================================
-- Clean up all triggers on post-related tables to prevent misconfigured DELETE triggers
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT trigger_name, event_object_table 
        FROM information_schema.triggers 
        WHERE event_object_schema = 'public' 
          AND event_object_table IN ('posts', 'post_likes', 'post_comments', 'post_saves', 'post_hashtags')
    LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || quote_ident(r.trigger_name) || ' ON ' || quote_ident(r.event_object_table) || ';';
    END LOOP;
END $$;

-- Create the correct trigger that fires ONLY on UPDATE
CREATE TRIGGER trigger_posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW
  EXECUTE FUNCTION update_users_updated_at();


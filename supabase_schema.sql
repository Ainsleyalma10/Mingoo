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

-- ============================================
-- 19. SUBSCRIPTIONS & PLANS
-- ============================================
CREATE TABLE IF NOT EXISTS subscription_plans (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name TEXT NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  duration_days INTEGER NOT NULL,
  coin_bonus INTEGER DEFAULT 0,
  features JSONB DEFAULT '[]',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id BIGINT NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'active', -- active, expired, cancelled
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 20. RBAC / ADMIN ROLES & PERMISSIONS
-- ============================================
CREATE TABLE IF NOT EXISTS admin_roles (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_permissions (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  action TEXT UNIQUE NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id BIGINT REFERENCES admin_roles(id) ON DELETE CASCADE,
  permission_id BIGINT REFERENCES admin_permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS admin_users (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  role_id BIGINT REFERENCES admin_roles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 21. AUDIT LOGS
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  admin_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id BIGINT,
  previous_value JSONB,
  new_value JSONB,
  ip_address TEXT,
  device_info TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 22. ANALYTICS & REPORTS
-- ============================================
CREATE TABLE IF NOT EXISTS host_analytics (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  host_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_stream_duration INTEGER DEFAULT 0, -- seconds
  total_viewers INTEGER DEFAULT 0,
  gifts_received INTEGER DEFAULT 0,
  revenue_generated INTEGER DEFAULT 0,
  UNIQUE(host_id, date)
);

CREATE TABLE IF NOT EXISTS stream_analytics (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  stream_id BIGINT REFERENCES streams(id) ON DELETE CASCADE,
  host_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  total_duration INTEGER DEFAULT 0,
  unique_viewers INTEGER DEFAULT 0,
  peak_concurrent INTEGER DEFAULT 0,
  gifts_amount INTEGER DEFAULT 0,
  revenue_generated INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS call_analytics (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  date DATE NOT NULL,
  total_calls INTEGER DEFAULT 0,
  total_duration INTEGER DEFAULT 0,
  total_revenue INTEGER DEFAULT 0,
  UNIQUE(date)
);

CREATE TABLE IF NOT EXISTS financial_reports (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  date DATE NOT NULL UNIQUE,
  total_revenue INTEGER DEFAULT 0,
  gift_revenue INTEGER DEFAULT 0,
  call_revenue INTEGER DEFAULT 0,
  subscription_revenue INTEGER DEFAULT 0,
  platform_profit INTEGER DEFAULT 0,
  host_earnings INTEGER DEFAULT 0,
  withdrawals_paid INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 23. SYSTEM & MODERATION
-- ============================================
CREATE TABLE IF NOT EXISTS notification_logs (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  sender_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL, -- single, multiple, hosts, all
  message TEXT NOT NULL,
  type TEXT DEFAULT 'in-app', -- push, in-app, email
  status TEXT DEFAULT 'sent',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_activity_logs (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS moderation_reports (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  reporter_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reported_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL, -- user, stream, message, post
  content_id TEXT,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, reviewed, resolved, dismissed
  resolved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL, -- positive for add, negative for remove
  transaction_type TEXT NOT NULL, -- purchase, gift, call, subscription, withdrawal, admin_adjustment
  reference_id TEXT,
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default Subscription Plans
INSERT INTO subscription_plans (name, price, duration_days, coin_bonus, features) VALUES
('Free', 0.00, 30, 0, '["Basic Access"]'),
('Silver', 9.99, 30, 100, '["Priority Support", "Silver Badge"]'),
('Gold', 19.99, 30, 300, '["Priority Support", "Gold Badge", "HD Streams"]'),
('VIP', 49.99, 30, 1000, '["24/7 Support", "VIP Badge", "4K Streams", "Private Calls"]')
ON CONFLICT DO NOTHING;

-- Seed Default Admin Roles
INSERT INTO admin_roles (name, description) VALUES
('Super Admin', 'Full system access'),
('Admin', 'Most platform controls'),
('Moderator', 'Content moderation only'),
('Finance Manager', 'Revenue and withdrawals'),
('Support Agent', 'User support tools')
ON CONFLICT (name) DO NOTHING;

-- Enable Realtime for Dashboard Updates (Safely ignoring duplicates)
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE users; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE streams; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE transactions; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE moderation_reports; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE withdrawals; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================
-- 24. ADMIN SEED DATA
-- ============================================
-- Enable pgcrypto to hash passwords inside the database
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Insert the Users (Admin & Super Admin)
INSERT INTO users (username, email, password, role, coin_balance, is_banned)
VALUES 
('MingooSuper', 'superadmin@mingoo.com', crypt('superadmin123', gen_salt('bf', 10)), 'admin', 9999999, FALSE),
('MingooAdmin', 'admin@mingoo.com', crypt('admin1234', gen_salt('bf', 10)), 'admin', 9999999, FALSE)
ON CONFLICT (email) DO NOTHING;

-- 2. Assign Roles in admin_users table
DO $$
DECLARE
    super_user_id BIGINT;
    admin_user_id BIGINT;
    super_role_id BIGINT;
    admin_role_id BIGINT;
BEGIN
    -- Get User IDs
    SELECT id INTO super_user_id FROM users WHERE email = 'superadmin@mingoo.com';
    SELECT id INTO admin_user_id FROM users WHERE email = 'admin@mingoo.com';
    
    -- Get Role IDs
    SELECT id INTO super_role_id FROM admin_roles WHERE name = 'Super Admin';
    SELECT id INTO admin_role_id FROM admin_roles WHERE name = 'Admin';
    
    -- Insert mapping if not exists
    IF super_user_id IS NOT NULL AND super_role_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = super_user_id) THEN
            INSERT INTO admin_users (user_id, role_id) VALUES (super_user_id, super_role_id);
        END IF;
    END IF;

    IF admin_user_id IS NOT NULL AND admin_role_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = admin_user_id) THEN
            INSERT INTO admin_users (user_id, role_id) VALUES (admin_user_id, admin_role_id);
        END IF;
    END IF;
END $$;


const { db } = require('../config/db');
const jwt = require('jsonwebtoken');
const { getRequiredEnv } = require('../config/security');

// GET /api/users/profile/:id
const getProfile = async (req, res) => {
    const userId = req.params.id;
    try {
        // Check if there is a bearer token in headers to identify the requesting user
        let requesterId = null;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            const token = req.headers.authorization.split(' ')[1];
            if (token) {
                try {
                    const decoded = jwt.verify(token, getRequiredEnv('JWT_SECRET'));
                    requesterId = decoded.id;
                } catch (e) {
                    // Ignore decoding error, treat as unauthenticated
                }
            }
        }

        // Prepare check follow status query (run in parallel)
        let isFollowingPromise = Promise.resolve(false);
        if (requesterId && String(requesterId) !== String(userId)) {
            isFollowingPromise = db
                .from('followers')
                .select('follower_id')
                .eq('follower_id', requesterId)
                .eq('following_id', userId)
                .limit(1)
                .single()
                .then(({ data }) => !!data)
                .catch(() => false);
        }

        // Try calling the single optimized database function first (5x faster)
        const [rpcResult, isFollowing] = await Promise.all([
            db.rpc('get_user_profile', { p_user_id: userId }),
            isFollowingPromise
        ]);
        
        const { data: rpcUser, error: rpcErr } = rpcResult;

        if (!rpcErr && rpcUser && rpcUser.length > 0) {
            return res.json({
                ...rpcUser[0],
                is_following: isFollowing
            });
        }

        // Fallback: Fetch user details and counts using multiple queries
        let userSelect = 'id, username, full_name, avatar, bio, coin_balance, created_at, country, gender, date_of_birth';
        let userResult = await db
            .from('users')
            .select(userSelect + ', updated_at')
            .eq('id', userId)
            .single();

        let user = userResult.data;
        let errUser = userResult.error;

        // If it failed because updated_at column doesn't exist, retry without it
        if (errUser && (errUser.message.includes('updated_at') || errUser.code === 'PGRST100' || errUser.code === '42703')) {
            const retryResult = await db
                .from('users')
                .select(userSelect)
                .eq('id', userId)
                .single();
            user = retryResult.data;
            errUser = retryResult.error;
            if (user) {
                user.updated_at = user.created_at; // Fallback updated_at to created_at
            }
        }

        if (errUser || !user) return res.status(404).json({ message: 'User not found' });

        const [followersResult, followingResult, postsResult, giftsReceivedResult] = await Promise.all([
            db.from('followers').select('*', { count: 'exact', head: true }).eq('following_id', userId),
            db.from('followers').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
            db.from('posts').select('*', { count: 'exact', head: true }).eq('user_id', userId),
            db.from('gifts_received').select('sender_id').eq('receiver_id', userId)
        ]);

        const followers_count = followersResult.count || 0;
        const following_count = followingResult.count || 0;
        const posts_count = postsResult.count || 0;
        const gifts_count = (giftsReceivedResult.data || []).length;
        const fans_count = new Set((giftsReceivedResult.data || []).map(g => g.sender_id)).size;

        res.json({ 
            ...user, 
            followers_count, 
            following_count, 
            posts_count,
            fans_count,
            gifts_count,
            is_following: isFollowing
        });
    } catch (error) {
        console.error('getProfile error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// PUT /api/users/profile
const updateProfile = async (req, res) => {
    const { username, bio, full_name, date_of_birth, country, gender } = req.body;
    const userId = req.user.id;

    if (!username || username.trim().length < 3) {
        return res.status(400).json({ message: 'Username must be at least 3 characters' });
    }

    try {
        // Fetch current user to calculate completion
        const { data: currentData } = await db.from('users').select('*').eq('id', userId).single();
        
        const updateData = { username: username.trim(), bio };
        if (full_name !== undefined) updateData.full_name = full_name.trim();
        if (date_of_birth !== undefined) updateData.date_of_birth = date_of_birth;
        if (country !== undefined) updateData.country = country;
        if (gender !== undefined) updateData.gender = gender;

        // Calculate profile completion percentage
        let completion = 0;
        const mergedData = { ...currentData, ...updateData };
        
        if (mergedData.username && mergedData.username.length >= 3) completion += 20;
        if (mergedData.avatar) completion += 20;
        if (mergedData.bio) completion += 20;
        if (mergedData.full_name) completion += 20;
        if (mergedData.date_of_birth || mergedData.country || mergedData.gender) completion += 20;
        
        updateData.profile_completion = completion;

        const { error } = await db
            .from('users')
            .update(updateData)
            .eq('id', userId);

        if (error) {
            if (error.code === '23505') { // Unique violation
                return res.status(400).json({ message: 'Username already taken' });
            }
            return res.status(500).json({ message: error.message });
        }
        
        res.json({ 
            message: 'Profile updated successfully',
            completion: completion,
            profile_completion: completion
        });
    } catch (e) {
        res.status(500).json({ message: 'Server error' });
    }
};

// POST /api/users/follow/:id
const followUser = async (req, res) => {
    const followerId = req.user.id;
    const followingId = req.params.id;

    if (followerId == followingId) {
        return res.status(400).json({ message: 'You cannot follow yourself' });
    }

    try {
        const { error } = await db
            .from('followers')
            .insert([{ follower_id: followerId, following_id: followingId }]);
            
        // Ignore duplicate insert errors (code 23505)
        if (error && error.code !== '23505') {
             return res.status(500).json({ message: error.message });
        }
        res.json({ message: 'Followed successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// DELETE /api/users/follow/:id
const unfollowUser = async (req, res) => {
    const followerId = req.user.id;
    const followingId = req.params.id;

    try {
        const { error } = await db
            .from('followers')
            .delete()
            .eq('follower_id', followerId)
            .eq('following_id', followingId);

        if (error) return res.status(500).json({ message: error.message });
        res.json({ message: 'Unfollowed successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// GET /api/users/follow-status/:id
const getFollowStatus = async (req, res) => {
    const followerId = req.user.id;
    const followingId = req.params.id;

    try {
        const { data, error } = await db
            .from('followers')
            .select('follower_id')
            .eq('follower_id', followerId)
            .eq('following_id', followingId)
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') { // not found code
             return res.status(500).json({ message: error.message });
        }
        
        res.json({ isFollowing: !!data });
    } catch (e) {
        res.status(500).json({ message: 'Server error' });
    }
};

// GET /api/users/search?q=query
const searchUsers = async (req, res) => {
    const query = req.query.q;
    if (!query) return res.json([]);

    try {
        const { data: users, error } = await db
            .from('users')
            .select('id, username, avatar')
            .ilike('username', `%${query}%`)
            .limit(10);

        if (error) return res.status(500).json({ message: error.message });
        res.json(users);
    } catch (error) {
         res.status(500).json({ message: 'Server error' });
    }
};

// GET /api/users/:id/followers
const getFollowers = async (req, res) => {
    const userId = req.params.id;
    try {
         const { data, error } = await db
            .from('followers')
            .select(`
               users!follower_id (
                  id,
                  username,
                  avatar
               )
            `)
            .eq('following_id', userId);

        if (error) return res.status(500).json({ message: error.message });
        
        const mappedUsers = data.map(f => f.users);
        res.json(mappedUsers);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// GET /api/users/:id/following
const getFollowing = async (req, res) => {
    const userId = req.params.id;
    try {
        const { data, error } = await db
            .from('followers')
            .select(`
               users!following_id (
                  id,
                  username,
                  avatar
               )
            `)
            .eq('follower_id', userId);

        if (error) return res.status(500).json({ message: error.message });
        
        const mappedUsers = data.map(f => f.users);
        res.json(mappedUsers);
    } catch (error) {
         res.status(500).json({ message: 'Server error' });
    }
};

// POST /api/users/profile/avatar
const updateAvatar = async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    
    const base64Image = req.file.buffer.toString('base64');
    const avatarPath = `data:${req.file.mimetype};base64,${base64Image}`;
    const userId = req.user.id;

    try {
        const { error } = await db
            .from('users')
            .update({ avatar: avatarPath })
            .eq('id', userId);

        if (error) return res.status(500).json({ message: error.message });
        res.json({ message: 'Avatar updated successfully', avatar: avatarPath });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    getProfile,
    updateProfile,
    followUser,
    unfollowUser,
    getFollowStatus,
    searchUsers,
    getFollowers,
    getFollowing,
    updateAvatar
};

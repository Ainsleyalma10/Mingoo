const jwt = require('jsonwebtoken');
const { db } = require('../config/db');
const { getRequiredEnv } = require('../config/security');
const admin = require('firebase-admin');

// Initialize Firebase Admin without credentials (only for verifying ID tokens)
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'mingoo-e6514'
    });
}

const generateToken = (id) =>
    jwt.sign({ id }, getRequiredEnv('JWT_SECRET'), { expiresIn: '30d' });

// POST /api/auth/google-login
const googleLogin = async (req, res) => {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ message: 'ID token is required' });

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const { uid, email } = decodedToken;

        // Check if user exists by firebase_uid
        let { data: user, error } = await db
            .from('users')
            .select('*')
            .eq('firebase_uid', uid)
            .single();

        if (!user) {
            // Also check by email in case they registered before Firebase migration
            let { data: userByEmail } = await db
                .from('users')
                .select('*')
                .eq('email', email)
                .single();

            if (userByEmail) {
                // Link the account
                await db.from('users').update({ firebase_uid: uid }).eq('id', userByEmail.id);
                user = userByEmail;
            } else {
                // User does not exist, requires registration
                return res.status(202).json({ requires_registration: true, email, uid });
            }
        }

        const token = generateToken(user.id);
        res.json({
            id: user.id, username: user.username, email: user.email,
            coin_balance: user.coin_balance, role: user.role,
            avatar: user.avatar, token
        });
    } catch (error) {
        console.error('Google login error:', error);
        res.status(401).json({ message: 'Invalid or expired ID token' });
    }
};

// POST /api/auth/complete-registration
const completeRegistration = async (req, res) => {
    let { idToken, username, avatar } = req.body;
    if (!idToken || !username) return res.status(400).json({ message: 'ID token and username are required' });

    username = username.trim();

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const { uid, email } = decodedToken;

        // Ensure user doesn't already exist
        const { data: existingUser } = await db.from('users').select('id').eq('firebase_uid', uid).single();
        if (existingUser) return res.status(400).json({ message: 'User already registered' });

        // Ensure username is unique
        const { data: existingUsername } = await db.from('users').select('id').eq('username', username).single();
        if (existingUsername) return res.status(400).json({ message: 'Username is already taken' });

        // Insert new user
        const { data: newUser, error: insertError } = await db
            .from('users')
            .insert([{ 
                username, 
                email, 
                firebase_uid: uid, 
                avatar: avatar || '' 
            }])
            .select('id, username, email, coin_balance, role, avatar')
            .single();

        if (insertError) return res.status(500).json({ message: insertError.message });

        const token = generateToken(newUser.id);
        res.status(201).json({
            id: newUser.id, username: newUser.username, email: newUser.email,
            coin_balance: newUser.coin_balance, role: newUser.role,
            avatar: newUser.avatar, token
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error: ' + error.message });
    }
};

// GET /api/auth/me
const getMe = async (req, res) => {
    try {
        const { data: user, error } = await db
            .from('users')
            .select('id, username, email, coin_balance, role, avatar, created_at')
            .eq('id', req.user.id)
            .limit(1)
            .single();

        if (error || !user) return res.status(404).json({ message: 'User not found' });

        // Get stream count
        const { count: total_streams } = await db
            .from('streams')
            .select('*', { count: 'exact', head: true })
            .eq('host_id', req.user.id);
            
        // Get followers count
        const { count: followers } = await db
            .from('followers')
            .select('*', { count: 'exact', head: true })
            .eq('following_id', req.user.id);

        res.json({ ...user, total_streams, followers });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = { googleLogin, completeRegistration, getMe };

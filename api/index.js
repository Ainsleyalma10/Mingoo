// Environment variables are handled by Vercel natively.
const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { initDB } = require('../server/config/db');
const { errorHandler, notFound } = require('../server/middlewares/errorMiddleware');
const { getAllowedOrigins, isOriginAllowed, getRequiredEnv } = require('../server/config/security');

// Routes
const authRoutes = require('../server/routes/auth');
const streamRoutes = require('../server/routes/streams');
const giftRoutes = require('../server/routes/gifts');
const walletRoutes = require('../server/routes/wallet');
const adminRoutes = require('../server/routes/admin');
const livekitRoutes = require('../server/routes/livekit');
const messageRoutes = require('../server/routes/messages');
const userRoutes = require('../server/routes/users');
const callRoutes = require('../server/routes/calls');
const uploadRoutes = require('../server/routes/upload');
const postRoutes = require('../server/routes/posts');

const app = express();
const allowedOrigins = getAllowedOrigins();

// Relaxed CORS for Vercel deployment
app.use(cors({
    origin: true,
    credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes (Static files are served automatically by Vercel from /public)

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/streams', streamRoutes);
app.use('/api/gifts', giftRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/livekit', livekitRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users', userRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/posts', postRoutes);

// Test Route to check if API is alive
app.get('/api/test', (req, res) => res.json({ message: 'API is working!', timestamp: new Date().toISOString() }));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Public config for frontend
app.get('/api/config', (req, res) => {
    res.json({
        livekitUrl: process.env.LIVEKIT_URL || null,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || null,
        supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || null,
        firebaseConfig: {
            apiKey: process.env.FIREBASE_API_KEY,
            authDomain: process.env.FIREBASE_AUTH_DOMAIN,
            projectId: process.env.FIREBASE_PROJECT_ID,
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.FIREBASE_APP_ID,
            measurementId: process.env.FIREBASE_MEASUREMENT_ID
        }
    });
});

// Note: Root and static files are served by Vercel Edge, not this function.

// Error Handling Middleware
app.use(notFound);
app.use(errorHandler);

// Export the app for Vercel
module.exports = app;

// Initialize DB lazily
initDB().catch(err => console.error("DB Init error in Vercel:", err));

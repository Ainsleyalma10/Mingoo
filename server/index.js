require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./config/db');
const { errorHandler, notFound } = require('./middlewares/errorMiddleware');
const { getAllowedOrigins, isOriginAllowed, getRequiredEnv } = require('./config/security');

// Routes
const authRoutes = require('./routes/auth');
const streamRoutes = require('./routes/streams');
const giftRoutes = require('./routes/gifts');
const walletRoutes = require('./routes/wallet');
const adminRoutes = require('./routes/admin');
const livekitRoutes = require('./routes/livekit');

const userRoutes = require('./routes/users');
const callRoutes = require('./routes/calls');
const uploadRoutes = require('./routes/upload');
const postRoutes = require('./routes/posts');

const app = express();
const allowedOrigins = getAllowedOrigins();
const server = http.createServer(app);

  // Relaxed CORS for Vercel deployment
  app.use(cors({
      origin: true,
      credentials: true,
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/streams', streamRoutes);
app.use('/api/gifts', giftRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/livekit', livekitRoutes);

app.use('/api/users', userRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/posts', postRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Public config for frontend
app.get('/api/config', (req, res) => {
    res.json({
        livekitUrl: process.env.LIVEKIT_URL || null,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || null,
        supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null,
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


// Catch-all: serve SPA for any non-API route
app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Error Handling Middleware
app.use(notFound);
app.use(errorHandler);

// Removed Socket.io handler for Vercel + Supabase Realtime

// Export the app for Vercel Serverless Functions
module.exports = app;

// Initialize DB then start server
const PORT = process.env.PORT || 3000;
let currentPort = parseInt(PORT, 10);

// Start the server only if we're not in a serverless environment (like Vercel)
// or if we're running this file directly.
const isVercel = process.env.VERCEL === '1' || !!process.env.VERCEL;

if (!isVercel) {
    getRequiredEnv('JWT_SECRET');
    initDB();

    server.on('error', (e) => {
        if (e.code === 'EADDRINUSE') {
            const nextPort = currentPort + 1;
            console.warn(`\n⚠️  Port ${currentPort} is busy, trying ${nextPort}...`);
            currentPort = nextPort;
            setTimeout(() => {
                server.close();
                server.listen(currentPort);
            }, 1000);
        }
    });

    server.listen(currentPort, '0.0.0.0', async () => {
        const actualPort = server.address().port;
        const os = require('os');
        const networkInterfaces = os.networkInterfaces();
        let localIp = 'localhost';
        
        Object.keys(networkInterfaces).forEach((ifname) => {
            networkInterfaces[ifname].forEach((iface) => {
                if (iface.family === 'IPv4' && !iface.internal) {
                    localIp = iface.address;
                }
            });
        });

        console.log(`\n🚀 MingooLive server is UP!`);
        console.log(`🏠 Local:   http://localhost:${actualPort}`);
        console.log(`🌐 Network: http://${localIp}:${actualPort}`);
        console.log(`📺 Admin:   http://localhost:${actualPort}/admin.html`);

        // Start ngrok tunnel for HTTPS access (Camera/Mic support)
        try {
            // Kill any existing ngrok process first to prevent port lock/multiple tunnels error
            await new Promise((resolve) => {
                const { exec } = require('child_process');
                const killCmd = process.platform === 'win32' ? 'taskkill /F /IM ngrok.exe' : 'killall ngrok';
                exec(killCmd, () => resolve()); // ignore error if no process was running
            });

            const ngrok = require('ngrok');
            const ngrokOptions = {
                addr: actualPort,
                proto: 'http'
            };
            if (process.env.NGROK_AUTHTOKEN) {
                ngrokOptions.authtoken = process.env.NGROK_AUTHTOKEN;
            }
            const url = await ngrok.connect(ngrokOptions);
            console.log(`\n🔒 SECURE TUNNEL (Use this for Mobile Camera):`);
            console.log(`🔗 ${url}`);
            console.log(`\n--------------------------------------------`);
        } catch (err) {
            console.warn('\n⚠️  Ngrok failed to start. This usually happens if you need an authtoken.');
            console.warn('👉 To fix: Create a free account at https://ngrok.com, get your authtoken, and add it to your .env file as: NGROK_AUTHTOKEN=your_token');
            console.error('Error:', err.message);
        }
    });
} else {
    // In Vercel, we still need to initialize the DB on the first cold start
    initDB().catch(err => console.error("DB Init error in Vercel:", err));
}

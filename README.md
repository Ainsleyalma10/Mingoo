# 🎭 MingooLive

> **A mobile-first live streaming platform** — Go Live, Connect, Earn.

MingooLive is a full-stack live streaming web application where users can broadcast live video, interact through real-time chat, send virtual gifts, earn coins, and manage their earnings. It features a complete admin dashboard, a virtual economy, and WebRTC-powered video streaming via LiveKit.

---

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Database Schema](#-database-schema)
- [API Reference](#-api-reference)
- [Environment Variables](#-environment-variables)
- [Getting Started](#-getting-started)
- [Deployment (Vercel)](#-deployment-vercel)
- [Architecture Overview](#-architecture-overview)
- [Security](#-security)
- [Known Limitations](#-known-limitations)

---

## ✨ Features

### 🎥 Live Streaming
- **Three stream types**: Public (anyone can watch), Private (host-only broadcast, viewers need approval), Group (host + approved co-streamers)
- **WebRTC video/audio** powered by LiveKit — low-latency, multi-participant
- **Stream categories**: Gaming, Music, Talk, Dance, Cooking, General
- **Thumbnail upload** on stream creation
- **Trending detection**: streams with 5+ viewers are marked as trending
- **Join requests**: viewers can request access to private/group streams; host approves or rejects
- **Real-time viewer count** tracking

### 💬 Real-time Chat & Messaging
- **Live stream chat** — messages broadcast to all viewers in a room via Supabase Realtime
- **Direct messages** — 1-on-1 persistent messaging between users
- **Conversation list** with last message preview
- **Read receipts** — messages marked as read automatically

### 🎁 Gift System
- **4 default gifts**: Rose 🌹 (10 coins), Star ⭐ (50 coins), Diamond 💎 (200 coins), Crown 👑 (500 coins)
- **Atomic transactions**: sender debited, receiver credited, with rollback on failure
- **Gift animations**: visual burst effects when gifts are received in a stream
- **Full transaction history** per user

### 💰 Wallet & Virtual Economy
- **Coin balance** — every new user starts with 1,000 coins
- **Buy coins** — simulated coin purchase packages (500 / 1,200 / 2,500 coins)
- **Earn coins** — receive coins when viewers send you gifts
- **Withdraw coins** — request a withdrawal (minimum 100 coins); requires admin approval
- **Optimistic locking** on balance updates — up to 4 retries to prevent race conditions
- **Transaction history** — last 50 transactions with gift details, sender/receiver names

### 👥 Social Features
- **Follow / Unfollow** users
- **Follower & following counts** on profiles
- **Following feed** — filter live streams to only show people you follow
- **User search** by username
- **Public profiles** — view any user's bio, avatar, earned coins, stream count, follower stats

### 🛡️ Admin Dashboard (`/admin.html`)
- **Platform statistics**: total users, total streams, live streams, pending withdrawals, total gifts sent, platform revenue
- **7-day revenue chart** (gift transactions over time)
- **Stream type breakdown** pie chart
- **User management**: view all users, ban / unban accounts
- **Stream management**: view all streams, forcibly terminate live streams
- **Withdrawal management**: approve or reject withdrawal requests (rejected requests auto-refund coins)

### 🔐 Authentication
- **JWT-based auth** with 30-day token expiration
- **Guest mode** — browse and watch streams for 5 minutes without an account
- **Role-based access control** — `user` and `admin` roles
- **Ban enforcement** — banned users are blocked at the middleware level

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js ≥ 18 |
| **Backend Framework** | Express.js 4 |
| **Database** | Supabase (PostgreSQL) |
| **Real-time** | Supabase Realtime (WebSocket channels) |
| **Live Video** | LiveKit (WebRTC) |
| **Authentication** | JSON Web Tokens (JWT) + bcryptjs |
| **File Uploads** | Multer (in-memory storage) |
| **Logging** | Winston |
| **Frontend** | Vanilla JavaScript SPA |
| **Styling** | Custom CSS (glassmorphism, mobile-first) |
| **Deployment** | Vercel (serverless) |

---

## 📁 Project Structure

```
MingooLive/
├── api/
│   └── index.js                  # Vercel serverless entry point
├── public/
│   ├── index.html                # Main SPA (user-facing app)
│   ├── admin.html                # Admin dashboard
│   ├── app.js                    # All frontend JavaScript logic
│   ├── style.css                 # Global styles
│   └── uploads/                  # User-uploaded files (local dev only)
├── server/
│   ├── index.js                  # Express app setup, route mounting, server start
│   ├── config/
│   │   ├── db.js                 # Supabase client init + optional admin seed
│   │   ├── security.js           # CORS helpers, env validation
│   │   └── logger.js             # Winston logger (console-only for Vercel)
│   ├── controllers/
│   │   ├── authController.js     # Register, login, get current user
│   │   ├── streamController.js   # CRUD for streams, join requests, viewer count
│   │   ├── giftController.js     # Gift catalog, send gift
│   │   ├── walletController.js   # Balance, buy coins, withdraw, history
│   │   ├── userController.js     # Profiles, follow/unfollow, avatar, search
│   │   ├── messageController.js  # Conversations, message threads, send message
│   │   ├── livekitController.js  # LiveKit access token generation
│   │   └── adminController.js    # Stats, user/stream/withdrawal management
│   ├── middlewares/
│   │   ├── auth.js               # JWT protect + adminOnly guards
│   │   ├── upload.js             # Multer config (images only, 2 MB limit)
│   │   └── errorMiddleware.js    # Global error handler + 404 handler
│   ├── routes/
│   │   ├── auth.js
│   │   ├── streams.js
│   │   ├── gifts.js
│   │   ├── wallet.js
│   │   ├── users.js
│   │   ├── messages.js
│   │   ├── livekit.js
│   │   └── admin.js
│   └── utils/
│       └── balance.js            # creditCoins / debitCoins with optimistic locking
├── supabase_schema.sql           # Full database schema + seed data
├── vercel.json                   # Vercel routing config
├── package.json
└── .env                          # Environment variables (never commit this)
```

---

## 🗄 Database Schema

All tables live in Supabase (PostgreSQL). Run `supabase_schema.sql` to create them.

### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT | Primary key, auto-generated |
| `username` | TEXT | Unique |
| `email` | TEXT | Unique |
| `password` | TEXT | bcrypt hash |
| `coin_balance` | INTEGER | Default: 1000 |
| `role` | TEXT | `user` or `admin` |
| `avatar` | TEXT | Base64 data URI |
| `bio` | TEXT | |
| `is_banned` | BOOLEAN | Default: false |
| `created_at` | TIMESTAMPTZ | |

### `streams`
| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT | Primary key |
| `title` | TEXT | |
| `category` | TEXT | Default: `General` |
| `type` | TEXT | `public`, `private`, or `group` |
| `host_id` | BIGINT | FK → users |
| `is_live` | BOOLEAN | |
| `viewer_count` | INTEGER | |
| `livekit_room` | TEXT | Room name used in LiveKit |
| `thumbnail` | TEXT | Base64 data URI |
| `created_at` | TIMESTAMPTZ | |

### `gifts`
| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT | Primary key |
| `name` | TEXT | e.g. `Rose` |
| `icon` | TEXT | Emoji |
| `coin_cost` | INTEGER | |

### `transactions`
| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT | Primary key |
| `sender_id` | BIGINT | FK → users |
| `receiver_id` | BIGINT | FK → users |
| `gift_id` | BIGINT | FK → gifts |
| `stream_id` | BIGINT | FK → streams |
| `gift_name` | TEXT | Denormalized for history |
| `gift_icon` | TEXT | Denormalized for history |
| `amount` | INTEGER | Coin amount |
| `type` | TEXT | `gift`, `purchase`, or `withdrawal` |
| `created_at` | TIMESTAMPTZ | |

### `withdrawals`
| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT | Primary key |
| `user_id` | BIGINT | FK → users |
| `amount` | INTEGER | |
| `status` | TEXT | `pending`, `approved`, `rejected` |
| `created_at` | TIMESTAMPTZ | |

### `stream_requests`
| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT | Primary key |
| `stream_id` | BIGINT | FK → streams |
| `user_id` | BIGINT | FK → users |
| `status` | TEXT | `pending`, `approved`, `rejected` |
| `created_at` | TIMESTAMPTZ | |

### `messages`
| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT | Primary key |
| `sender_id` | BIGINT | FK → users |
| `receiver_id` | BIGINT | FK → users |
| `message` | TEXT | |
| `is_read` | BOOLEAN | Default: false |
| `created_at` | TIMESTAMPTZ | |

### `followers`
| Column | Type | Notes |
|---|---|---|
| `follower_id` | BIGINT | FK → users, composite PK |
| `following_id` | BIGINT | FK → users, composite PK |
| `created_at` | TIMESTAMPTZ | |

**Default gift seed data** (inserted by `supabase_schema.sql`):

| Name | Icon | Cost |
|---|---|---|
| Rose | 🌹 | 10 coins |
| Star | ⭐ | 50 coins |
| Diamond | 💎 | 200 coins |
| Crown | 👑 | 500 coins |

---

## 📡 API Reference

All API routes are prefixed with `/api`. Protected routes require an `Authorization: Bearer <token>` header.

### Auth — `/api/auth`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/register` | — | Create a new account |
| POST | `/login` | — | Login, returns JWT token |
| GET | `/me` | ✅ | Get current user profile + stats |

### Streams — `/api/streams`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/` | — | List all live public streams |
| GET | `/all` | ✅ | List all live streams (supports `?category=following`) |
| GET | `/search?q=` | — | Search streams by title or host username |
| GET | `/:id` | — | Get a single stream by ID |
| POST | `/` | ✅ | Create a new stream (multipart: `thumbnail`) |
| PUT | `/:id/end` | ✅ | End your stream |
| POST | `/:id/request` | ✅ | Request to join a private/group stream |
| PUT | `/requests/:requestId` | ✅ | Approve or reject a join request |
| GET | `/:id/requests` | ✅ | Get pending join requests (host only) |
| PUT | `/:id/viewers` | — | Update viewer count |

### Gifts — `/api/gifts`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/` | — | List all available gifts |
| POST | `/send` | ✅ | Send a gift to a streamer |

**Send gift body:**
```json
{
  "gift_id": 1,
  "stream_id": 42,
  "receiver_id": 7
}
```

### Wallet — `/api/wallet`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/` | ✅ | Get coin balance + last 50 transactions |
| POST | `/buy` | ✅ | Purchase coins (simulated) |
| POST | `/withdraw` | ✅ | Request a withdrawal |
| GET | `/withdrawals` | ✅ | Get your withdrawal history |

**Buy coins body:**
```json
{ "packageId": "pkg_500", "coins": 500 }
```

**Withdraw body:**
```json
{ "amount": 200 }
```

### Users — `/api/users`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/profile/:id` | — | Get a user's public profile |
| PUT | `/profile` | ✅ | Update your username and bio |
| POST | `/profile/avatar` | ✅ | Upload a new avatar (multipart) |
| POST | `/follow/:id` | ✅ | Follow a user |
| DELETE | `/follow/:id` | ✅ | Unfollow a user |
| GET | `/follow-status/:id` | ✅ | Check if you follow a user |
| GET | `/search?q=` | — | Search users by username |
| GET | `/:id/followers` | — | Get a user's followers list |
| GET | `/:id/following` | — | Get a user's following list |

### Messages — `/api/messages`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/` | ✅ | Get all conversations (latest message per partner) |
| GET | `/:partnerId` | ✅ | Get full message thread with a user |
| POST | `/` | ✅ | Send a direct message |

**Send message body:**
```json
{ "receiver_id": 5, "message": "Hey!" }
```

### LiveKit — `/api/livekit`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/token` | Optional | Get a LiveKit access token for a room |

**Token request body:**
```json
{
  "room": "room_1234567890_42",
  "identity": "alice",
  "name": "Alice",
  "canPublish": true
}
```

### Admin — `/api/admin` *(admin role required)*

| Method | Endpoint | Description |
|---|---|---|
| GET | `/stats` | Platform-wide statistics |
| GET | `/users` | List all users |
| GET | `/streams` | List all streams |
| GET | `/withdrawals` | List all withdrawal requests |
| PUT | `/withdrawals/:id` | Approve or reject a withdrawal |
| GET | `/revenue-chart` | 7-day gift revenue data |
| PUT | `/streams/:id/terminate` | Force-end a live stream |
| PUT | `/users/:id/ban` | Ban or unban a user |

### Utility

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Health check — returns `{ status: "ok" }` |
| GET | `/api/config` | Returns public config (LiveKit URL, Supabase URL/key) |

---

## 🔧 Environment Variables

Create a `.env` file in the project root. **Never commit this file.**

```env
# ─── DATABASE (SUPABASE) ──────────────────────────────────────────────
# Get from: Supabase Dashboard > Project Settings > API
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-public-key

# ─── STREAMING (LIVEKIT) ──────────────────────────────────────────────
# Get from: https://cloud.livekit.io
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret

# ─── SECURITY ─────────────────────────────────────────────────────────
# Any long random string — used to sign JWT tokens
JWT_SECRET=your-very-long-random-secret-here

# ─── APP CONFIG ───────────────────────────────────────────────────────
PORT=3000
NODE_ENV=development

# Comma-separated list of allowed CORS origins
ALLOWED_ORIGINS=http://localhost:3000

# ─── ADMIN SEED (optional) ────────────────────────────────────────────
# Set ENABLE_ADMIN_SEED=true to auto-create an admin account on first start
ENABLE_ADMIN_SEED=false
ADMIN_SEED_EMAIL=admin@example.com
ADMIN_SEED_USERNAME=admin
ADMIN_SEED_PASSWORD=your-secure-admin-password
```

### Variable Reference

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | ✅ | Your Supabase project URL |
| `SUPABASE_KEY` | ✅ | Supabase anon/public API key |
| `LIVEKIT_URL` | ✅ | LiveKit WebSocket server URL |
| `LIVEKIT_API_KEY` | ✅ | LiveKit API key |
| `LIVEKIT_API_SECRET` | ✅ | LiveKit API secret |
| `JWT_SECRET` | ✅ | Secret for signing JWT tokens |
| `PORT` | — | Server port (default: 3000) |
| `NODE_ENV` | — | `development` or `production` |
| `ALLOWED_ORIGINS` | — | CORS allowed origins |
| `ENABLE_ADMIN_SEED` | — | Set to `true` to seed an admin user |
| `ADMIN_SEED_EMAIL` | — | Admin seed email (requires `ENABLE_ADMIN_SEED=true`) |
| `ADMIN_SEED_USERNAME` | — | Admin seed username |
| `ADMIN_SEED_PASSWORD` | — | Admin seed password |

---

## 🚀 Getting Started

### Prerequisites

- Node.js ≥ 18
- A [Supabase](https://supabase.com) project
- A [LiveKit Cloud](https://cloud.livekit.io) project (or self-hosted LiveKit server)

### 1. Clone the repository

```bash
git clone https://github.com/your-username/MingooLive.git
cd MingooLive
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up the database

1. Go to your Supabase project's **SQL Editor**
2. Copy the contents of `supabase_schema.sql`
3. Run it — this creates all tables and seeds the default gift catalog

### 4. Configure environment variables

```bash
cp .env.example .env
# Edit .env with your Supabase, LiveKit, and JWT credentials
```

### 5. (Optional) Seed an admin account

In your `.env`, set:
```env
ENABLE_ADMIN_SEED=true
ADMIN_SEED_EMAIL=admin@yourdomain.com
ADMIN_SEED_PASSWORD=a-strong-password
```

The admin account will be created on the first server start. Set `ENABLE_ADMIN_SEED=false` afterwards.

### 6. Start the development server

```bash
npm run dev
```

The server starts at `http://localhost:3000`.

- **User app**: `http://localhost:3000`
- **Admin panel**: `http://localhost:3000/admin.html`

### 7. Start the production server

```bash
npm start
```

---

## ☁️ Deployment (Vercel)

This project is pre-configured for Vercel serverless deployment.

### Steps

1. Push your code to a GitHub repository
2. Import the project in [Vercel](https://vercel.com)
3. Add all environment variables from the `.env` reference above in the Vercel dashboard under **Settings > Environment Variables**
4. Deploy — Vercel will use `vercel.json` to route:
   - `/api/*` → `api/index.js` (serverless function)
   - Everything else → `public/index.html` (SPA fallback)

### Vercel-specific notes

- File uploads are stored as **base64 data URIs** in the database (Multer uses in-memory storage since Vercel's filesystem is read-only)
- Winston logging is console-only (no file transports)
- Socket.io is not used — real-time is handled entirely by Supabase Realtime channels

---

## 🏗 Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (SPA)                        │
│  public/index.html + public/app.js + public/style.css   │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  LiveKit SDK │  │ Supabase JS  │  │  REST API     │  │
│  │  (WebRTC)    │  │  (Realtime)  │  │  (Express)    │  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘  │
└─────────┼─────────────────┼──────────────────┼──────────┘
          │                 │                  │
          ▼                 ▼                  ▼
   ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐
   │  LiveKit    │  │  Supabase    │  │  Express Server  │
   │  Cloud      │  │  Realtime    │  │  (Node.js)       │
   │  (WebRTC)   │  │  (WebSocket) │  │                  │
   └─────────────┘  └──────┬───────┘  └────────┬─────────┘
                           │                   │
                           ▼                   ▼
                    ┌─────────────────────────────┐
                    │     Supabase PostgreSQL      │
                    │  users, streams, gifts,      │
                    │  transactions, withdrawals,  │
                    │  messages, followers, ...    │
                    └─────────────────────────────┘
```

### Real-time Event Flow

The frontend subscribes to **Supabase Realtime channels** for all live updates:

- **`room:{livekit_room}`** — per-stream channel for chat messages, reactions, gift animations, viewer count, join requests, guest events, and stream-ended signals
- **`global:{userId}`** — per-user channel for direct messages, guest invites, and invite replies

### Coin Transaction Flow (Gift)

```
Sender clicks gift
       │
       ▼
POST /api/gifts/send
       │
       ├─ Debit sender's coin_balance (optimistic lock, up to 4 retries)
       │
       ├─ Credit receiver's coin_balance (optimistic lock, up to 4 retries)
       │   └─ On failure: refund sender
       │
       └─ Insert transaction record
           └─ On failure: reverse both balance changes
```

### LiveKit Token Authorization

```
Client requests token (POST /api/livekit/token)
       │
       ├─ Public stream → token issued, canPublish = false (viewer)
       │
       ├─ Private stream → must be host OR have approved stream_request
       │
       └─ Group stream → host can publish; approved members can publish
```

---

## 🔒 Security

| Concern | Implementation |
|---|---|
| Password storage | bcryptjs, 10 salt rounds |
| Session tokens | JWT, 30-day expiry, signed with `JWT_SECRET` |
| Route protection | `protect` middleware verifies JWT on every request |
| Admin routes | `adminOnly` middleware checks `role === 'admin'` |
| Banned users | Blocked at middleware level — 403 on any protected route |
| File uploads | Images only (MIME check), 2 MB size limit |
| Balance race conditions | Optimistic locking with up to 4 retries |
| CORS | Configurable via `ALLOWED_ORIGINS`; relaxed on Vercel |
| Env validation | `getRequiredEnv()` warns on missing critical variables |

> ⚠️ **Note**: The `.env` file in this repository contains real credentials and should be rotated immediately. Never commit secrets to version control.

---

## ⚠️ Known Limitations

- **No real payment processing** — coin purchases are simulated (no Stripe/PayPal integration)
- **No video recording** — past streams cannot be replayed
- **Base64 image storage** — avatars and thumbnails are stored as base64 strings in the database, which is not ideal for large-scale use. A proper object storage solution (e.g., Supabase Storage, S3) is recommended for production
- **No email verification** — users can register with any email address
- **No rate limiting** — API endpoints are not rate-limited
- **Guest timer** — guests are prompted to register after 5 minutes but can dismiss the prompt
- **Admin seed** — must be manually enabled via environment variable and disabled after first run
- **No stream recording or VOD** — live-only platform

---

## 📦 Dependencies

| Package | Version | Purpose |
|---|---|---|
| `express` | ^4.18.2 | Web framework |
| `@supabase/supabase-js` | ^2.103.0 | Database + Realtime client |
| `livekit-server-sdk` | ^2.8.3 | LiveKit token generation |
| `jsonwebtoken` | ^9.0.2 | JWT auth tokens |
| `bcryptjs` | ^3.0.3 | Password hashing |
| `multer` | ^2.1.1 | File upload handling |
| `cors` | ^2.8.5 | CORS middleware |
| `dotenv` | ^16.4.7 | Environment variable loading |
| `winston` | ^3.19.0 | Logging |
| `socket.io` | ^4.7.5 | (Installed but not actively used — replaced by Supabase Realtime) |
| `nodemon` | ^3.1.14 | Dev: auto-restart on file changes |

---

## 📄 License

ISC

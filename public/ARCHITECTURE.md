# MingooLive - Architecture Diagram

## 🏗️ Overall Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          BROWSER (SPA)                                      │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        index.html                                    │  │
│  │                                                                      │  │
│  │  ┌─────────────────────────────────────────────────────────────┐   │  │
│  │  │ MODALS (Always present, hidden by default)                 │   │  │
│  │  │ ├─ auth-overlay (Login/Register)                           │   │  │
│  │  │ ├─ guest-timer-popup (5-min timer)                         │   │  │
│  │  │ ├─ profile-modal (Edit profile)                            │   │  │
│  │  │ ├─ withdraw-modal (Request withdrawal)                     │   │  │
│  │  │ └─ joinreq-modal (Private stream access)                   │   │  │
│  │  └─────────────────────────────────────────────────────────────┘   │  │
│  │                                                                      │  │
│  │  ┌─────────────────────────────────────────────────────────────┐   │  │
│  │  │ APP WRAPPER                                                 │   │  │
│  │  │                                                             │   │  │
│  │  │ ┌─────────────────────────────────────────────────────┐   │   │  │
│  │  │ │ TOP BAR (Logo, Search, Notifications, Avatar)      │   │   │  │
│  │  │ └─────────────────────────────────────────────────────┘   │   │  │
│  │  │                                                             │   │  │
│  │  │ ┌─────────────────────────────────────────────────────┐   │   │  │
│  │  │ │ MAIN CONTENT (Only one screen visible at a time)   │   │   │  │
│  │  │ │                                                     │   │   │  │
│  │  │ │ ┌─────────────────────────────────────────────┐   │   │   │  │
│  │  │ │ │ SCREENS (9 total)                           │   │   │   │  │
│  │  │ │ │ ├─ screen-home (Browse streams)             │   │   │   │  │
│  │  │ │ │ ├─ screen-golive (Create stream)            │   │   │   │  │
│  │  │ │ │ ├─ screen-live (Watch/broadcast)            │   │   │   │  │
│  │  │ │ │ ├─ screen-chat (Conversations)              │   │   │   │  │
│  │  │ │ │ ├─ screen-chat-thread (Message thread)      │   │   │   │  │
│  │  │ │ │ ├─ screen-wallet (Coins & transactions)     │   │   │   │  │
│  │  │ │ │ ├─ screen-profile (My profile)              │   │   │   │  │
│  │  │ │ │ ├─ screen-view-profile (Other profile)      │   │   │   │  │
│  │  │ │ │ └─ screen-follow-list (Followers/following) │   │   │   │  │
│  │  │ │ └─────────────────────────────────────────────┘   │   │   │  │
│  │  │ └─────────────────────────────────────────────────────┘   │   │  │
│  │  │                                                             │   │  │
│  │  │ ┌─────────────────────────────────────────────────────┐   │   │  │
│  │  │ │ BOTTOM NAV (5 buttons)                              │   │   │  │
│  │  │ │ 🏠 Home │ 📡 Go Live │ 💬 Chat │ 💰 Wallet │ 👤 Profile │   │   │  │
│  │  │ └─────────────────────────────────────────────────────┘   │   │  │
│  │  └─────────────────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ app.js (2069 lines)                                                  │  │
│  │ ├─ Navigation & Screen Management                                    │  │
│  │ ├─ Authentication (Login/Register/Logout)                            │  │
│  │ ├─ API Requests (apiReq)                                             │  │
│  │ ├─ Real-time (Supabase Realtime)                                     │  │
│  │ ├─ LiveKit (WebRTC Video/Audio)                                      │  │
│  │ ├─ Stream Management                                                 │  │
│  │ ├─ Chat & Messaging                                                  │  │
│  │ ├─ Gifts & Wallet                                                    │  │
│  │ ├─ Profile & Follow System                                           │  │
│  │ └─ Utility Functions                                                 │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ External Libraries                                                   │  │
│  │ ├─ Supabase JS Client (Database + Realtime)                          │  │
│  │ └─ LiveKit Client (WebRTC)                                           │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
         │                          │                          │
         ▼                          ▼                          ▼
    ┌─────────────┐         ┌──────────────┐         ┌──────────────────┐
    │  LiveKit    │         │  Supabase    │         │  Express Server  │
    │  Cloud      │         │  Realtime    │         │  (Node.js)       │
    │  (WebRTC)   │         │  (WebSocket) │         │                  │
    └─────────────┘         └──────┬───────┘         └────────┬─────────┘
                                   │                         │
                                   ▼                         ▼
                            ┌─────────────────────────────────┐
                            │     Supabase PostgreSQL         │
                            │  (Database + Authentication)    │
                            │                                 │
                            │ Tables:                         │
                            │ ├─ users                        │
                            │ ├─ streams                      │
                            │ ├─ gifts                        │
                            │ ├─ transactions                 │
                            │ ├─ withdrawals                  │
                            │ ├─ stream_requests              │
                            │ ├─ messages                     │
                            │ └─ followers                    │
                            └─────────────────────────────────┘
```

---

## 🔄 Data Flow: User Registration

```
┌─────────────────────────────────────────────────────────────────────────┐
│ User Registration Flow                                                  │
└─────────────────────────────────────────────────────────────────────────┘

1. App Loads
   └─ showAuthOverlay('login')
      └─ auth-overlay visible

2. User Clicks "Register"
   └─ showAuthForm('register')
      └─ register-form visible

3. User Fills Form & Submits
   └─ register-form submit event
      └─ apiReq('POST', '/api/auth/register', { username, email, password })
         └─ Express Server
            └─ POST /api/auth/register
               ├─ Validate input
               ├─ Hash password (bcryptjs)
               ├─ INSERT INTO users
               └─ Generate JWT token

4. Response Received
   └─ saveSession(user)
      ├─ token = user.token
      ├─ currentUser = user
      ├─ localStorage.setItem('tl_token', token)
      └─ localStorage.setItem('tl_user', JSON.stringify(user))

5. Post-Login Setup
   └─ afterLogin()
      ├─ clearGuestTimer()
      ├─ supabaseClient.removeAllChannels()
      ├─ initSocket()
      │  └─ Create Supabase Realtime connection
      ├─ renderTopBar()
      │  └─ Show user avatar
      └─ navigateTo('home')
         └─ loadStreams()
            └─ GET /api/streams
               └─ Render stream feed
```

---

## 🎬 Data Flow: Watch Live Stream

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Watch Live Stream Flow                                                  │
└─────────────────────────────────────────────────────────────────────────┘

1. User Clicks Stream Card
   └─ openStream(streamId)
      └─ GET /api/streams/:id
         └─ currentStream = stream

2. Check Stream Type
   ├─ Public → enterLiveScreen()
   ├─ Private/Group (not host) → showJoinRequestModal()
   │  └─ POST /api/streams/:id/request
   │     └─ Host receives join-request-received event
   │        └─ showJoinRequestToast()
   │           └─ Host clicks Allow/Deny
   │              └─ PUT /api/streams/requests/:requestId
   │                 └─ Broadcast join-response event
   │                    └─ Viewer receives approval
   │                       └─ enterLiveScreen()
   └─ Private/Group (host) → enterLiveScreen()

3. Enter Live Screen
   └─ enterLiveScreen(stream)
      ├─ Update HUD (title, viewers, host info)
      ├─ Show/hide host controls
      ├─ Clear chat
      ├─ Switch to screen-live
      ├─ initSocket()
      │  └─ Connect to Supabase Realtime
      ├─ joinRoom(stream.livekit_room)
      │  └─ Subscribe to room channel
      │     └─ Listen for: chat, reactions, gifts, viewer count
      └─ Get LiveKit Token
         └─ POST /api/livekit/token
            └─ Express Server
               ├─ Verify user permissions
               ├─ Generate LiveKit token
               └─ Return token

4. Connect to LiveKit
   └─ connectToLiveKit(token, room)
      ├─ Create LiveKit Room object
      ├─ Connect with token
      ├─ Subscribe to remote tracks
      ├─ Publish local tracks (if host)
      └─ Listen for participant events

5. Real-time Updates
   ├─ Chat Message
   │  └─ User types message
   │     └─ sendChatMessage('live')
   │        └─ Broadcast chat-message event
   │           └─ All viewers receive message
   │              └─ appendChat()
   │
   ├─ Reaction
   │  └─ User clicks reaction button
   │     └─ sendReaction('❤️')
   │        └─ Broadcast reaction event
   │           └─ All viewers receive reaction
   │              └─ showFloatingReaction()
   │
   ├─ Gift
   │  └─ User sends gift
   │     └─ sendGift(giftId, streamId, receiverId)
   │        └─ POST /api/gifts/send
   │           ├─ Debit sender coins
   │           ├─ Credit receiver coins
   │           ├─ INSERT transaction
   │           └─ Broadcast gift-animation event
   │              └─ All viewers receive gift
   │                 └─ showGiftBurst()
   │
   └─ Viewer Count
      └─ Supabase Presence sync
         └─ Broadcast viewer-count event
            └─ Update HUD viewer count

6. Exit Stream
   └─ leaveLiveScreen()
      ├─ Disconnect LiveKit
      ├─ Unsubscribe from room channel
      ├─ Clear video area
      ├─ Clear chat
      └─ navigateTo('home')
```

---

## 💬 Data Flow: Send Gift

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Send Gift Flow                                                          │
└─────────────────────────────────────────────────────────────────────────┘

1. User Clicks Gift Button
   └─ toggleGiftPanel()
      └─ Show gift-panel with gift options

2. User Selects Gift
   └─ sendGift(giftId, streamId, receiverId)
      └─ POST /api/gifts/send
         └─ Express Server
            ├─ GET gift details
            ├─ Debit sender coins (optimistic lock)
            │  └─ UPDATE users SET coin_balance = coin_balance - cost
            │     WHERE id = sender_id AND coin_balance = current_balance
            │     (Retry up to 4 times if balance changed)
            │
            ├─ Credit receiver coins (optimistic lock)
            │  └─ UPDATE users SET coin_balance = coin_balance + cost
            │     WHERE id = receiver_id AND coin_balance = current_balance
            │     (Retry up to 4 times if balance changed)
            │     (On failure: refund sender)
            │
            ├─ INSERT transaction
            │  └─ INSERT INTO transactions
            │     (sender_id, receiver_id, gift_id, stream_id, amount, type)
            │     (On failure: reverse both balance changes)
            │
            └─ Return success

3. Broadcast Gift Animation
   └─ Supabase Realtime
      └─ Broadcast gift-animation event
         └─ Payload: { gift, sender, receiver }
            └─ All viewers in room receive event
               └─ showGiftBurst(gift.icon, sender, gift.name)
                  └─ Display burst animation

4. Update Wallet
   └─ Receiver's wallet balance updated
      └─ Next time wallet is loaded:
         └─ loadWallet()
            └─ GET /api/wallet
               └─ Display new balance
               └─ Show transaction in history
```

---

## 🔐 Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Authentication & Session Management                                    │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ LOGIN FLOW                                                              │
└─────────────────────────────────────────────────────────────────────────┘

1. User Submits Login Form
   └─ POST /api/auth/login { email, password }
      └─ Express Server
         ├─ SELECT * FROM users WHERE email = ?
         ├─ bcrypt.compare(password, user.password)
         ├─ Generate JWT token
         │  └─ jwt.sign({ id }, JWT_SECRET, { expiresIn: '30d' })
         └─ Return { id, username, email, coin_balance, role, avatar, token }

2. Save Session
   └─ localStorage.setItem('tl_token', token)
   └─ localStorage.setItem('tl_user', JSON.stringify(user))

3. Initialize Socket
   └─ initSocket()
      └─ Create Supabase Realtime connection
         └─ Subscribe to global-updates channel

4. Render UI
   └─ renderTopBar()
      └─ Show user avatar

┌─────────────────────────────────────────────────────────────────────────┐
│ PROTECTED ROUTE FLOW                                                    │
└─────────────────────────────────────────────────────────────────────────┘

1. API Request
   └─ apiReq('GET', '/api/protected-endpoint')
      └─ Fetch with headers:
         ├─ Authorization: Bearer {token}
         └─ Content-Type: application/json

2. Express Middleware
   └─ protect middleware
      ├─ Extract token from Authorization header
      ├─ jwt.verify(token, JWT_SECRET)
      ├─ SELECT * FROM users WHERE id = ?
      ├─ Check if user is banned
      └─ Attach user to req.user

3. Route Handler
   └─ Access req.user
      └─ Perform action
         └─ Return response

┌─────────────────────────────────────────────────────────────────────────┐
│ LOGOUT FLOW                                                             │
└─────────────────────────────────────────────────────────────────────────┘

1. User Clicks Logout
   └─ logout()
      ├─ token = null
      ├─ currentUser = null
      ├─ localStorage.removeItem('tl_token')
      ├─ localStorage.removeItem('tl_user')
      ├─ supabaseClient.removeAllChannels()
      ├─ socket = null
      ├─ renderTopBar()
      │  └─ Hide user avatar
      ├─ navigateTo('home')
      └─ showAuthOverlay('login')

┌─────────────────────────────────────────────────────────────────────────┐
│ GUEST MODE FLOW                                                         │
└─────────────────────────────────────────────────────────────────────────┘

1. User Clicks "Continue as Guest"
   └─ hideAuthOverlay()
      ├─ auth-overlay hidden
      └─ startGuestTimer()
         └─ 5-minute countdown
            └─ guest-timer-popup visible
               └─ On expiry:
                  ├─ clearGuestTimer()
                  ├─ leaveLiveScreen()
                  └─ showAuthOverlay('register')

2. Guest Can:
   ├─ Browse streams
   ├─ Watch live streams
   ├─ View profiles
   └─ Search

3. Guest Cannot:
   ├─ Create streams
   ├─ Send gifts
   ├─ Send messages
   ├─ Access wallet
   └─ Edit profile
```

---

## 🎯 Screen Navigation Map

```
                          ┌─────────────────┐
                          │  auth-overlay   │
                          │ (Login/Register)│
                          └────────┬────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
            ┌──────────────┐          ┌──────────────────┐
            │ screen-home  │          │ guest-timer-popup│
            │ (Browse)     │          │ (5-min timer)    │
            └──────┬───────┘          └──────────────────┘
                   │
        ┌──────────┼──────────┬──────────┬──────────┐
        │          │          │          │          │
        ▼          ▼          ▼          ▼          ▼
    ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
    │ Go     │ │ Chat   │ │Wallet  │ │Profile │ │ Live   │
    │ Live   │ │        │ │        │ │        │ │ Stream │
    └────┬───┘ └───┬────┘ └───┬────┘ └───┬────┘ └────────┘
         │         │          │          │
         │         ▼          ▼          ▼
         │    ┌─────────┐ ┌──────────┐ ┌──────────────┐
         │    │ Chat    │ │Withdraw  │ │ View Profile │
         │    │ Thread  │ │ Modal    │ │              │
         │    └─────────┘ └──────────┘ └────────┬─────┘
         │                                       │
         │                                       ▼
         │                                  ┌──────────────┐
         │                                  │ Follow List  │
         │                                  │              │
         │                                  └──────────────┘
         │
         └─────────────────────────────────────────────────┐
                                                           │
                                                           ▼
                                                    ┌──────────────┐
                                                    │ Profile      │
                                                    │ Editor Modal │
                                                    └──────────────┘
```

---

## 🔌 API Request Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│ API Request Flow                                                        │
└─────────────────────────────────────────────────────────────────────────┘

1. Frontend (app.js)
   └─ apiReq(method, path, body)
      ├─ Prepare headers
      │  ├─ Content-Type: application/json
      │  └─ Authorization: Bearer {token} (if authenticated)
      ├─ Prepare body (if provided)
      └─ fetch(API + path, { method, headers, body })

2. Network
   └─ HTTP Request
      └─ POST /api/endpoint
         ├─ Headers
         └─ Body (JSON)

3. Backend (Express Server)
   └─ Route Handler
      ├─ Middleware
      │  ├─ CORS
      │  ├─ JSON Parser
      │  ├─ Auth (if protected)
      │  └─ Error Handler
      ├─ Controller
      │  ├─ Validate input
      │  ├─ Query database
      │  ├─ Process data
      │  └─ Return response
      └─ Response
         ├─ Status code
         ├─ Headers
         └─ Body (JSON)

4. Network
   └─ HTTP Response
      ├─ Status code
      ├─ Headers
      └─ Body (JSON)

5. Frontend (app.js)
   └─ Response Handler
      ├─ Check status
      ├─ Parse JSON
      ├─ Handle success
      │  └─ Return data
      └─ Handle error
         └─ Throw error
            └─ Catch in try/catch
               └─ Show error message
```

---

## 📊 Real-time Event Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Real-time Event Flow (Supabase Realtime)                               │
└─────────────────────────────────────────────────────────────────────────┘

1. Sender
   └─ window.roomChannel.send({
      type: 'broadcast',
      event: 'chat-message',
      payload: { username, message, avatar }
   })

2. Supabase Realtime Server
   └─ Receive broadcast message
      └─ Validate payload
         └─ Broadcast to all subscribers in room

3. All Subscribers in Room
   └─ Receive broadcast event
      └─ window.roomChannel.on('broadcast', { event: 'chat-message' }, ({ payload }) => {
         appendChat(payload.username, payload.message, false, payload.avatar);
      })

4. Frontend Handler
   └─ appendChat()
      ├─ Create message element
      ├─ Add to chat-messages container
      ├─ Scroll to bottom
      └─ Update UI

┌─────────────────────────────────────────────────────────────────────────┐
│ Presence Tracking (Viewer Count)                                        │
└─────────────────────────────────────────────────────────────────────────┘

1. User Joins Room
   └─ channel.track({
      online_at: new Date().toISOString(),
      username: currentUser.username
   })

2. Supabase Presence
   └─ Track user in room
      └─ Broadcast presence sync event

3. All Users in Room
   └─ Receive presence sync
      └─ channel.on('presence', { event: 'sync' }, () => {
         const state = channel.presenceState();
         const count = Object.keys(state).length;
         updateViewerCount(count);
      })

4. Update Viewer Count
   └─ $('hud-viewers').textContent = count
   └─ If host: PUT /api/streams/:id/viewers { count }
```

---

## 🎥 LiveKit Connection Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│ LiveKit WebRTC Connection Flow                                          │
└─────────────────────────────────────────────────────────────────────────┘

1. Get LiveKit Token
   └─ POST /api/livekit/token
      └─ Express Server
         ├─ Verify user permissions
         ├─ Check stream type (public/private/group)
         ├─ Generate LiveKit token
         │  └─ AccessToken(apiKey, apiSecret, {
         │     identity: username,
         │     name: username,
         │     ttl: '2h'
         │  })
         │  └─ addGrant({
         │     room: roomName,
         │     roomJoin: true,
         │     canPublish: isHost,
         │     canPublishData: isHost,
         │     canSubscribe: true
         │  })
         └─ Return token

2. Connect to LiveKit
   └─ connectToLiveKit(token, room)
      ├─ Create Room object
      │  └─ new LivekitClient.Room()
      ├─ Connect with token
      │  └─ room.connect(livekitUrl, token)
      ├─ Listen for participant events
      │  ├─ participantConnected
      │  ├─ participantDisconnected
      │  ├─ trackSubscribed
      │  └─ trackUnsubscribed
      └─ Publish local tracks (if host)
         ├─ Get camera stream
         │  └─ navigator.mediaDevices.getUserMedia()
         ├─ Get microphone stream
         │  └─ navigator.mediaDevices.getUserMedia()
         └─ Publish tracks
            └─ room.localParticipant.publishTrack()

3. Subscribe to Remote Tracks
   └─ On trackSubscribed event
      ├─ Get video/audio track
      ├─ Create video element
      ├─ Attach track to video element
      │  └─ videoElement.srcObject = new MediaStream([track])
      └─ Add to video area

4. Manage Video Grid
   └─ updateVideoGrid()
      ├─ Count active participants
      ├─ Calculate grid layout
      │  ├─ 1 participant: 1 column
      ├─ 2 participants: 2 columns
      ├─ 3-4 participants: 2x2 grid
      └─ 5+ participants: 3 columns
      └─ Resize video elements

5. Disconnect
   └─ leaveLiveScreen()
      ├─ Stop local tracks
      ├─ Disconnect from room
      │  └─ room.disconnect()
      └─ Clear video elements
```

---

## 📈 State Management

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Global State Variables                                                  │
└─────────────────────────────────────────────────────────────────────────┘

Authentication State
├─ token (JWT token)
├─ currentUser (user object)
└─ socketConnected (boolean)

Navigation State
├─ currentScreen (screen name)
├─ viewProfileUserId (viewing user ID)
└─ chatPartnerId (chat partner ID)

Stream State
├─ currentStream (stream object)
├─ isHost (boolean)
├─ livekitRoom (room name)
├─ isGuestStreamer (boolean)
└─ activeGuestIds (Set of guest IDs)

Real-time State
├─ socket (Supabase global channel)
├─ supabaseClient (Supabase client)
└─ window.roomChannel (Supabase room channel)

UI State
├─ guestTimerInterval (timer ID)
├─ homeRefreshTimer (timer ID)
├─ isGoLiveInProgress (boolean)
├─ isGiftSending (boolean)
└─ pendingJoinRequest (request object)

Cached Data
├─ cachedLivekitUrl (LiveKit URL)
└─ mediaStream (local media stream)

┌─────────────────────────────────────────────────────────────────────────┐
│ Local Storage                                                           │
└─────────────────────────────────────────────────────────────────────────┘

tl_token
└─ JWT token (persists across page reloads)

tl_user
└─ User object (persists across page reloads)
   ├─ id
   ├─ username
   ├─ email
   ├─ coin_balance
   ├─ role
   ├─ avatar
   └─ token
```

---

**Last Updated:** May 2026
**Version:** 1.0.0


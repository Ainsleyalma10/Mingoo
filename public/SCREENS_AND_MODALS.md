# MingooLive - Screens & Modals Architecture

## Overview

This document maps all screens and modals in the MingooLive SPA, their purposes, features, navigation flows, and dependencies.

---

## 📋 Table of Contents

1. [Screens](#screens)
2. [Modals](#modals)
3. [Navigation Flow](#navigation-flow)
4. [Component Dependencies](#component-dependencies)
5. [File Organization](#file-organization)

---

## Screens

Screens are full-page views accessed via the bottom navigation or internal navigation. Only one screen is visible at a time.

### 1. **Home Screen** (`screen-home`)
**File:** `screens/home.html`

**Purpose:** Browse and discover live streams

**Features:**
- Category filtering (All, Following, Gaming, Music, Talk, Dance, Cooking)
- Stream feed with thumbnails, viewer counts, and stream type badges
- Search integration
- Trending indicators (🔥 for streams with 5+ viewers)
- Private/Group stream badges (🔒 / 👥)

**Navigation:**
- Accessed via bottom nav "Home" button
- Click stream card → `openStream(streamId)` → `enterLiveScreen()` → `screen-live`
- Category pills → `loadStreams(category)`
- Search bar → `searchAll(query)` → renders search results

**Dependencies:**
- `loadStreams(category)` - fetch streams from API
- `renderStreamFeed(streams, category)` - render stream cards
- `openStream(streamId)` - open a stream
- `searchAll(query)` - search streams and users
- `renderSearchResults(streams, users)` - render search results

**Key Functions:**
```javascript
loadStreams(cat)                    // Load streams by category
renderStreamFeed(streams, cat)      // Render stream cards
openStream(streamId)                // Open stream
searchAll(query)                    // Search streams/users
renderSearchResults(streams, users) // Show search results
```

---

### 2. **Go Live Screen** (`screen-golive`)
**File:** `screens/golive.html`

**Purpose:** Create and start a new live stream

**Features:**
- Camera preview (local video feed)
- Stream title input
- Category selection (General, Gaming, Music, Talk, Dance, Cooking)
- Stream type picker (Public, Private, Group)
- Go Live button to create stream

**Navigation:**
- Accessed via bottom nav "Go Live" button
- Requires authentication (redirects to login if not logged in)
- On success → `enterLiveScreen()` → `screen-live`

**Dependencies:**
- `initCamera()` - start camera preview
- `stopCamera()` - stop camera when leaving
- `createStream()` - POST /api/streams
- `captureThumbnail()` - capture video frame as thumbnail
- `navigateTo('golive')` - show screen

**Key Functions:**
```javascript
initCamera()                        // Start camera preview
stopCamera()                        // Stop camera
createStream()                      // Create new stream
captureThumbnail()                  // Capture thumbnail
```

---

### 3. **Live Stream Screen** (`screen-live`)
**File:** `screens/live.html`

**Purpose:** Watch or broadcast a live stream with real-time chat, reactions, and gifts

**Features:**
- Video area with remote/local video feeds (LiveKit WebRTC)
- Real-time chat messages
- Reaction buttons (❤️, 🔥, 🎉)
- Gift sending panel
- Viewer count display
- Host controls (mic/camera toggle)
- Viewer controls (audio/video mute)
- Join request notifications (for host)
- End stream button (host only)
- Follow button (viewers)

**Navigation:**
- Accessed via `openStream()` → `enterLiveScreen()`
- Back button → `leaveLiveScreen()` → `screen-home`
- End stream button → `endStream()` → `screen-home`

**Dependencies:**
- `connectToLiveKit(token, room)` - establish WebRTC connection
- `joinRoom(roomName)` - join Supabase Realtime room
- `sendChatMessage(type)` - send message to room
- `sendReaction(emoji)` - broadcast reaction emoji
- `toggleGiftPanel()` - show/hide gift panel
- `sendGift(giftId, streamId, receiverId)` - send gift
- `toggleMic()` / `toggleCam()` - host controls
- `toggleViewerAudio()` / `toggleViewerVideo()` - viewer controls
- `updateVideoGrid()` - manage video layout
- `endStream()` - end broadcast (host only)
- `toggleFollow()` - follow/unfollow host
- `leaveLiveScreen()` - exit stream

**Key Functions:**
```javascript
enterLiveScreen(stream, existingToken)  // Enter live stream
connectToLiveKit(token, room)           // Connect to LiveKit
joinRoom(roomName)                      // Join Supabase room
sendChatMessage(type)                   // Send chat message
sendReaction(emoji)                     // Send reaction
toggleGiftPanel()                       // Show/hide gifts
sendGift(giftId, streamId, receiverId)  // Send gift
toggleMic() / toggleCam()               // Host controls
toggleViewerAudio() / toggleViewerVideo() // Viewer controls
endStream()                             // End stream
leaveLiveScreen()                       // Exit stream
```

---

### 4. **Chat List Screen** (`screen-chat`)
**File:** `screens/chat.html`

**Purpose:** View all active conversations

**Features:**
- List of conversation partners
- Last message preview
- Click to open conversation thread

**Navigation:**
- Accessed via bottom nav "Chat" button
- Requires authentication (redirects to login if not logged in)
- Click conversation → `openChatThread(partnerId)` → `screen-chat-thread`

**Dependencies:**
- `renderChatList()` - fetch and render conversations
- `getConversations()` - fetch all conversations
- `openChatThread(partnerId)` - open specific conversation

**Key Functions:**
```javascript
renderChatList()                    // Render conversation list
getConversations()                  // Fetch conversations
openChatThread(partnerId)           // Open conversation
```

---

### 5. **Chat Thread Screen** (`screen-chat-thread`)
**File:** `screens/chat.html`

**Purpose:** View and send messages with a specific user

**Features:**
- Full message history with partner
- Real-time message updates via Supabase Realtime
- Message input and send button
- Partner avatar and name in header
- Auto-scroll to latest message

**Navigation:**
- Accessed from `screen-chat` by clicking a conversation
- Back button → `navigateTo('chat')` → `screen-chat`

**Dependencies:**
- `openChatThread(partnerId)` - fetch and display thread
- `sendDirectMessage()` - send message
- `handleIncomingDirectMessage(payload)` - receive real-time messages
- `renderChatThread(messages)` - render messages

**Key Functions:**
```javascript
openChatThread(partnerId)           // Open conversation
sendDirectMessage()                 // Send message
handleIncomingDirectMessage(payload) // Receive message
renderChatThread(messages)          // Render messages
```

---

### 6. **Wallet Screen** (`screen-wallet`)
**File:** `screens/wallet.html`

**Purpose:** Manage coins, purchases, withdrawals, and view transaction history

**Features:**
- Display current coin balance
- Buy coin packages (500, 1200, 2500 coins)
- Request withdrawal (minimum 100 coins)
- View transaction history (last 50 transactions)
- Transaction types: gift, purchase, withdrawal

**Navigation:**
- Accessed via bottom nav "Wallet" button
- Requires authentication (redirects to login if not logged in)
- Withdrawal button → `showWithdrawModal()` → `withdraw-modal`
- Buy coin package → `buyCoins(amount)` → simulated purchase

**Dependencies:**
- `loadWallet()` - fetch wallet data and transactions
- `renderWallet()` - render wallet UI
- `buyCoins(amount)` - POST /api/wallet/buy
- `showWithdrawModal()` - show withdrawal modal
- `submitWithdrawal()` - POST /api/wallet/withdraw

**Key Functions:**
```javascript
loadWallet()                        // Load wallet data
renderWallet()                      // Render wallet UI
buyCoins(amount)                    // Buy coins
showWithdrawModal()                 // Show withdrawal modal
submitWithdrawal()                  // Submit withdrawal
```

---

### 7. **My Profile Screen** (`screen-profile`)
**File:** `screens/profile.html`

**Purpose:** View and manage current user's profile

**Features:**
- Display user avatar, username, email, bio
- Show statistics: followers, following, wallet balance, earned coins
- Edit profile button → `profile-modal`
- Logout button
- Guest message (if not logged in)

**Navigation:**
- Accessed via bottom nav "Profile" button
- Edit button → `openProfileEditor()` → `profile-modal`
- Logout button → `logout()` → `auth-overlay`

**Dependencies:**
- `renderProfile()` - fetch and render current user profile
- `openProfileEditor()` - show profile edit modal
- `logout()` - clear session and show login

**Key Functions:**
```javascript
renderProfile()                     // Render profile
openProfileEditor()                 // Show edit modal
logout()                            // Logout
```

---

### 8. **View User Profile Screen** (`screen-view-profile`)
**File:** `screens/profile.html`

**Purpose:** View another user's public profile

**Features:**
- Display user avatar, username, bio
- Show statistics: followers, following, earned coins
- Follow/Unfollow button
- Send message button
- Back button to return to previous screen

**Navigation:**
- Accessed via `viewUserProfile(userId)` from search results or stream cards
- Back button → `navigateTo('home')` or previous screen
- Follow button → `toggleFollowProfile()`
- Message button → `openChatThread(userId)`
- Followers/Following stats → `showFollowList(userId, 'followers'/'following')`

**Dependencies:**
- `viewUserProfile(userId)` - fetch and display user profile
- `toggleFollowProfile()` - follow/unfollow user
- `openChatThread(userId)` - start direct message
- `showFollowList(userId, type)` - show followers/following

**Key Functions:**
```javascript
viewUserProfile(userId)             // View user profile
toggleFollowProfile()               // Follow/unfollow
openChatThread(userId)              // Send message
showFollowList(userId, type)        // Show followers/following
```

---

### 9. **Follow List Screen** (`screen-follow-list`)
**File:** `screens/profile.html`

**Purpose:** View followers or following list for a user

**Features:**
- List of users (followers or following)
- Click user to view their profile
- Back button to return to profile

**Navigation:**
- Accessed from `screen-view-profile` by clicking followers/following stats
- Back button → `goBackFromFollowList()`
- Click user → `viewUserProfile(userId)`

**Dependencies:**
- `getFollowers(userId)` / `getFollowing(userId)` - fetch list
- `renderFollowList(users)` - render user list
- `goBackFromFollowList()` - return to previous profile

**Key Functions:**
```javascript
getFollowers(userId)                // Fetch followers
getFollowing(userId)                // Fetch following
renderFollowList(users)             // Render list
goBackFromFollowList()              // Go back
```

---

## Modals

Modals are overlay dialogs that appear on top of screens. Multiple modals can exist but only one is visible at a time.

### 1. **Auth Overlay** (`auth-overlay`)
**File:** `modals/auth.html`

**Purpose:** Handle user authentication (login/register)

**Features:**
- Login form (email + password)
- Register form (username + email + password)
- Toggle between forms
- Guest mode option
- Error messages

**Navigation:**
- Shown via `showAuthOverlay(form)` - 'login' or 'register'
- Hidden via `hideAuthOverlay()` - starts guest timer
- Form submission → `saveSession()` → `afterLogin()`

**Dependencies:**
- `showAuthOverlay(form)` - show overlay
- `hideAuthOverlay()` - hide overlay
- `showAuthForm(form)` - toggle between login/register
- `apiReq()` - POST /api/auth/login or /api/auth/register
- `saveSession(user)` - store token and user data
- `afterLogin()` - initialize socket and navigate

**Key Functions:**
```javascript
showAuthOverlay(form)               // Show auth overlay
hideAuthOverlay()                   // Hide overlay
showAuthForm(form)                  // Toggle form
saveSession(user)                   // Save session
afterLogin()                        // Post-login setup
```

---

### 2. **Guest Timer Popup** (`guest-timer-popup`)
**File:** `modals/guest-timer.html`

**Purpose:** Notify guest users that their 5-minute preview is ending

**Features:**
- Countdown timer (5:00 → 0:00)
- Sign up button
- Login button
- Auto-hides when timer expires

**Navigation:**
- Shown via `startGuestTimer()` after `hideAuthOverlay()`
- Sign up button → `showAuthOverlay('register')`
- Login button → `showAuthOverlay('login')`
- Timer expires → `showAuthOverlay('register')`

**Dependencies:**
- `startGuestTimer()` - initialize 5-minute countdown
- `clearGuestTimer()` - stop timer
- `showAuthOverlay()` - show auth overlay

**Key Functions:**
```javascript
startGuestTimer()                   // Start 5-min timer
clearGuestTimer()                   // Stop timer
```

---

### 3. **Profile Editor Modal** (`profile-modal`)
**File:** `modals/profile-editor.html`

**Purpose:** Edit current user's profile (avatar, username, bio)

**Features:**
- Avatar upload with preview
- Username input
- Bio textarea
- Save and cancel buttons

**Navigation:**
- Shown via `openProfileEditor()` from `screen-profile`
- Save button → `saveProfile()` → PUT /api/users/profile
- Cancel button → `closeModal('profile-modal')`

**Dependencies:**
- `openProfileEditor()` - populate form with current data
- `previewAvatar(input)` - show avatar preview on file select
- `saveProfile()` - POST /api/users/profile/avatar + PUT /api/users/profile
- `closeModal(id)` - hide modal

**Key Functions:**
```javascript
openProfileEditor()                 // Show modal
previewAvatar(input)                // Preview avatar
saveProfile()                       // Save profile
closeModal(id)                      // Close modal
```

---

### 4. **Withdrawal Modal** (`withdraw-modal`)
**File:** `modals/wallet.html`

**Purpose:** Request a coin withdrawal

**Features:**
- Amount input (minimum 100 coins)
- Submit button
- Cancel button
- Error message display

**Navigation:**
- Shown via `showWithdrawModal()` from `screen-wallet`
- Submit button → `submitWithdrawal()` → POST /api/wallet/withdraw
- Cancel button → `closeModal('withdraw-modal')`

**Dependencies:**
- `showWithdrawModal()` - show modal
- `submitWithdrawal()` - POST /api/wallet/withdraw
- `closeModal(id)` - hide modal

**Key Functions:**
```javascript
showWithdrawModal()                 // Show modal
submitWithdrawal()                  // Submit withdrawal
closeModal(id)                      // Close modal
```

---

### 5. **Join Request Modal** (`joinreq-modal`)
**File:** `modals/wallet.html`

**Purpose:** Show status of join request for private/group streams

**Features:**
- Status message (waiting, approved, denied)
- Cancel button to close
- Auto-closes on approval

**Navigation:**
- Shown via `showJoinRequestModal(stream)` when opening private/group stream
- Status updates via Supabase Realtime (join-response event)
- Cancel button → `closeModal('joinreq-modal')`
- On approval → auto-closes and enters stream

**Dependencies:**
- `showJoinRequestModal(stream)` - show modal
- `closeModal(id)` - hide modal
- Supabase Realtime join-response event

**Key Functions:**
```javascript
showJoinRequestModal(stream)        // Show modal
closeModal(id)                      // Close modal
```

---

## Navigation Flow

### User Journey: Guest → Login → Home → Stream → Chat → Wallet → Profile

```
┌─────────────────────────────────────────────────────────────────┐
│                      INITIAL STATE                              │
│                                                                 │
│  App loads → showAuthOverlay('login') → auth-overlay visible   │
│                                                                 │
│  User can:                                                      │
│  1. Login → saveSession() → afterLogin() → screen-home         │
│  2. Register → saveSession() → afterLogin() → screen-home      │
│  3. Continue as Guest → hideAuthOverlay() → startGuestTimer()  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATED USER                           │
│                                                                 │
│  Bottom Nav:                                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🏠 Home │ 📡 Go Live │ 💬 Chat │ 💰 Wallet │ 👤 Profile │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Home Screen:                                                   │
│  ├─ Browse streams by category                                 │
│  ├─ Search streams/users                                       │
│  ├─ Click stream → openStream() → enterLiveScreen()            │
│  └─ Click user → viewUserProfile()                             │
│                                                                 │
│  Go Live Screen:                                                │
│  ├─ Configure stream (title, category, type)                   │
│  ├─ Preview camera                                             │
│  └─ Go Live → createStream() → enterLiveScreen()               │
│                                                                 │
│  Live Stream Screen:                                            │
│  ├─ Watch/broadcast video (LiveKit)                            │
│  ├─ Chat in real-time (Supabase Realtime)                      │
│  ├─ Send reactions (❤️, 🔥, 🎉)                                │
│  ├─ Send gifts (opens gift-panel)                              │
│  ├─ Host: toggle mic/camera, end stream                        │
│  ├─ Viewer: mute audio/video, follow host                      │
│  └─ Back → leaveLiveScreen() → screen-home                     │
│                                                                 │
│  Chat Screen:                                                   │
│  ├─ View all conversations                                     │
│  ├─ Click conversation → openChatThread()                      │
│  └─ Chat Thread: send/receive messages                         │
│                                                                 │
│  Wallet Screen:                                                 │
│  ├─ View coin balance                                          │
│  ├─ Buy coins (500, 1200, 2500)                                │
│  ├─ Request withdrawal → showWithdrawModal()                   │
│  └─ View transaction history                                   │
│                                                                 │
│  Profile Screen:                                                │
│  ├─ View my profile (avatar, username, bio, stats)             │
│  ├─ Edit profile → openProfileEditor() → profile-modal         │
│  ├─ View followers/following → showFollowList()                │
│  └─ Logout → logout() → auth-overlay                           │
│                                                                 │
│  View User Profile Screen:                                      │
│  ├─ View other user's profile                                  │
│  ├─ Follow/Unfollow → toggleFollowProfile()                    │
│  ├─ Send message → openChatThread()                            │
│  └─ View followers/following → showFollowList()                │
│                                                                 │
│  Follow List Screen:                                            │
│  ├─ View followers or following list                           │
│  ├─ Click user → viewUserProfile()                             │
│  └─ Back → goBackFromFollowList()                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Dependencies

### Core Functions

| Function | Type | Purpose | Called From |
|---|---|---|---|
| `navigateTo(screenName)` | Navigation | Switch between screens | Bottom nav, internal links |
| `showAuthOverlay(form)` | Modal | Show login/register | App init, protected routes |
| `hideAuthOverlay()` | Modal | Hide auth overlay | Login/register success |
| `showModal(id)` | Modal | Show any modal | Various |
| `closeModal(id)` | Modal | Close any modal | Modal buttons |
| `openStream(streamId)` | Navigation | Open a stream | Stream cards |
| `enterLiveScreen(stream)` | Navigation | Enter live stream | openStream, join requests |
| `leaveLiveScreen()` | Navigation | Exit live stream | Back button, end stream |
| `openChatThread(partnerId)` | Navigation | Open conversation | Chat list |
| `viewUserProfile(userId)` | Navigation | View user profile | Search, stream cards |
| `showFollowList(userId, type)` | Navigation | Show followers/following | Profile stats |
| `goBackFromFollowList()` | Navigation | Return from follow list | Back button |

### API Functions

| Function | Method | Endpoint | Purpose |
|---|---|---|---|
| `apiReq(method, path, body)` | GET/POST/PUT | Any | Generic API request |
| `loadStreams(category)` | GET | /api/streams | Fetch streams |
| `createStream()` | POST | /api/streams | Create new stream |
| `endStream()` | PUT | /api/streams/:id/end | End stream |
| `sendGift(giftId, streamId, receiverId)` | POST | /api/gifts/send | Send gift |
| `loadGifts()` | GET | /api/gifts | Fetch gift catalog |
| `loadWallet()` | GET | /api/wallet | Fetch wallet data |
| `buyCoins(amount)` | POST | /api/wallet/buy | Buy coins |
| `submitWithdrawal()` | POST | /api/wallet/withdraw | Request withdrawal |
| `renderProfile()` | GET | /api/auth/me | Fetch current user |
| `saveProfile()` | PUT/POST | /api/users/profile | Update profile |
| `viewUserProfile(userId)` | GET | /api/users/profile/:id | Fetch user profile |
| `toggleFollowProfile()` | POST/DELETE | /api/users/follow/:id | Follow/unfollow |
| `renderChatList()` | GET | /api/messages | Fetch conversations |
| `openChatThread(partnerId)` | GET | /api/messages/:partnerId | Fetch messages |
| `sendDirectMessage()` | POST | /api/messages | Send message |

### Real-time Functions (Supabase)

| Function | Purpose | Channel |
|---|---|---|
| `initSocket()` | Initialize Supabase Realtime | global-updates |
| `joinRoom(roomName)` | Join stream room | room:{livekit_room} |
| `sendChatMessage(type)` | Send chat message | room:{livekit_room} |
| `sendReaction(emoji)` | Send reaction | room:{livekit_room} |
| `handleIncomingDirectMessage(payload)` | Receive direct message | global-updates |

### LiveKit Functions

| Function | Purpose |
|---|---|
| `connectToLiveKit(token, room)` | Connect to LiveKit room |
| `toggleMic()` | Toggle host microphone |
| `toggleCam()` | Toggle host camera |
| `toggleViewerAudio()` | Toggle viewer audio |
| `toggleViewerVideo()` | Toggle viewer video |
| `updateVideoGrid()` | Update video layout |

---

## File Organization

### New Structure

```
public/
├── index.html                    # Main HTML (includes all screens/modals)
├── app.js                        # Main JavaScript logic
├── style.css                     # Global styles
├── SCREENS_AND_MODALS.md         # This file
│
├── screens/                      # Screen components
│   ├── home.html                 # Home screen
│   ├── golive.html               # Go Live screen
│   ├── live.html                 # Live Stream screen
│   ├── chat.html                 # Chat List & Chat Thread screens
│   ├── wallet.html               # Wallet screen
│   └── profile.html              # Profile screens (My Profile, View Profile, Follow List)
│
└── modals/                       # Modal components
    ├── auth.html                 # Auth overlay (Login/Register)
    ├── guest-timer.html          # Guest timer popup
    ├── profile-editor.html       # Profile editor modal
    └── wallet.html               # Withdrawal & Join Request modals
```

### How to Include in index.html

```html
<!DOCTYPE html>
<html>
<head>
  <!-- ... -->
</head>
<body>
  <!-- Modals (always present, hidden by default) -->
  <div id="modals-container">
    <!-- Include modals/auth.html -->
    <!-- Include modals/guest-timer.html -->
    <!-- Include modals/profile-editor.html -->
    <!-- Include modals/wallet.html -->
  </div>

  <!-- App Wrapper -->
  <div id="app">
    <!-- Top Bar -->
    <header class="top-bar"><!-- ... --></header>

    <!-- Screens (only one visible at a time) -->
    <main id="main-content">
      <!-- Include screens/home.html -->
      <!-- Include screens/golive.html -->
      <!-- Include screens/live.html -->
      <!-- Include screens/chat.html -->
      <!-- Include screens/wallet.html -->
      <!-- Include screens/profile.html -->
    </main>

    <!-- Bottom Navigation -->
    <nav class="bottom-nav"><!-- ... --></nav>
  </div>

  <!-- Scripts -->
  <script src="app.js"></script>
</body>
</html>
```

---

## Quick Reference: Screen/Modal Visibility

| Component | ID | Default | Shown By | Hidden By |
|---|---|---|---|---|
| Auth Overlay | auth-overlay | hidden | showAuthOverlay() | hideAuthOverlay() |
| Guest Timer | guest-timer-popup | hidden | startGuestTimer() | clearGuestTimer() |
| Profile Modal | profile-modal | hidden | openProfileEditor() | closeModal() |
| Withdraw Modal | withdraw-modal | hidden | showWithdrawModal() | closeModal() |
| Join Request Modal | joinreq-modal | hidden | showJoinRequestModal() | closeModal() |
| Home Screen | screen-home | active | navigateTo('home') | navigateTo(other) |
| Go Live Screen | screen-golive | hidden | navigateTo('golive') | navigateTo(other) |
| Live Screen | screen-live | hidden | enterLiveScreen() | leaveLiveScreen() |
| Chat Screen | screen-chat | hidden | navigateTo('chat') | navigateTo(other) |
| Chat Thread | screen-chat-thread | hidden | openChatThread() | navigateTo('chat') |
| Wallet Screen | screen-wallet | hidden | navigateTo('wallet') | navigateTo(other) |
| Profile Screen | screen-profile | hidden | navigateTo('profile') | navigateTo(other) |
| View Profile | screen-view-profile | hidden | viewUserProfile() | navigateTo(other) |
| Follow List | screen-follow-list | hidden | showFollowList() | goBackFromFollowList() |

---

## Key Patterns

### 1. Screen Navigation
```javascript
navigateTo(screenName) {
  // Hide all screens
  // Show target screen
  // Update bottom nav active state
  // Call screen-specific setup (loadStreams, loadWallet, etc.)
}
```

### 2. Modal Management
```javascript
showModal(id) {
  $(id).classList.remove('hidden');
}

closeModal(id) {
  $(id).classList.add('hidden');
}
```

### 3. Real-time Updates
```javascript
// Supabase Realtime channels
globalChannel.on('broadcast', { event: 'event-name' }, ({ payload }) => {
  // Handle event
});

roomChannel.on('broadcast', { event: 'event-name' }, ({ payload }) => {
  // Handle event
});
```

### 4. API Requests
```javascript
try {
  const data = await apiReq('GET', '/api/endpoint', body);
  // Handle success
} catch (err) {
  // Handle error
}
```

---

## Testing Checklist

- [ ] All screens load correctly
- [ ] Navigation between screens works
- [ ] Modals open and close properly
- [ ] Auth flow (login/register/logout) works
- [ ] Guest timer starts and expires
- [ ] Stream creation and viewing works
- [ ] Chat messages send and receive
- [ ] Gifts send and display
- [ ] Wallet operations work
- [ ] Profile editing works
- [ ] Follow/unfollow works
- [ ] Real-time updates work (chat, reactions, viewer count)
- [ ] LiveKit video connection works
- [ ] Mobile responsive design works

---

## Future Improvements

1. **Component Modularization**: Convert screens/modals to reusable components
2. **State Management**: Implement a state management system (Redux, Zustand)
3. **Error Handling**: Centralized error handling and user feedback
4. **Loading States**: Consistent loading indicators across all screens
5. **Animations**: Smooth transitions between screens and modals
6. **Accessibility**: ARIA labels and keyboard navigation
7. **Performance**: Lazy loading, code splitting, caching
8. **Testing**: Unit tests for all functions and integration tests for flows


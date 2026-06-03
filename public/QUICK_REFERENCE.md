# MingooLive - Quick Reference Guide

## 🎯 Screen IDs & Navigation

| Screen | ID | Nav Button | Purpose |
|---|---|---|---|
| Home | `screen-home` | 🏠 Home | Browse streams |
| Go Live | `screen-golive` | 📡 Go Live | Create stream |
| Live Stream | `screen-live` | — | Watch/broadcast |
| Chat List | `screen-chat` | 💬 Chat | View conversations |
| Chat Thread | `screen-chat-thread` | — | Message thread |
| Wallet | `screen-wallet` | 💰 Wallet | Manage coins |
| My Profile | `screen-profile` | 👤 Profile | View my profile |
| View Profile | `screen-view-profile` | — | View other profile |
| Follow List | `screen-follow-list` | — | View followers |

## 🎨 Modal IDs & Functions

| Modal | ID | Show Function | Purpose |
|---|---|---|---|
| Auth | `auth-overlay` | `showAuthOverlay(form)` | Login/Register |
| Guest Timer | `guest-timer-popup` | `startGuestTimer()` | 5-min timer |
| Profile Editor | `profile-modal` | `openProfileEditor()` | Edit profile |
| Withdrawal | `withdraw-modal` | `showWithdrawModal()` | Request withdrawal |
| Join Request | `joinreq-modal` | `showJoinRequestModal()` | Private stream access |

## 🔧 Core Functions

### Navigation
```javascript
navigateTo(screenName)              // Switch screens
showModal(id)                       // Show modal
closeModal(id)                      // Close modal
```

### Auth
```javascript
showAuthOverlay(form)               // Show login/register
hideAuthOverlay()                   // Hide auth overlay
logout()                            // Logout user
```

### Streams
```javascript
loadStreams(category)               // Load streams
openStream(streamId)                // Open stream
enterLiveScreen(stream)             // Enter live stream
leaveLiveScreen()                   // Exit live stream
endStream()                         // End stream (host)
```

### Chat
```javascript
renderChatList()                    // Show conversations
openChatThread(partnerId)           // Open conversation
sendDirectMessage()                 // Send message
sendChatMessage(type)               // Send live chat
```

### Gifts
```javascript
loadGifts()                         // Load gift catalog
sendGift(giftId, streamId, receiverId) // Send gift
toggleGiftPanel()                   // Show/hide gifts
```

### Wallet
```javascript
loadWallet()                        // Load wallet data
buyCoins(amount)                    // Buy coins
showWithdrawModal()                 // Show withdrawal
submitWithdrawal()                  // Submit withdrawal
```

### Profile
```javascript
renderProfile()                     // Show my profile
openProfileEditor()                 // Show edit modal
saveProfile()                       // Save profile
viewUserProfile(userId)             // View other profile
toggleFollowProfile()               // Follow/unfollow
showFollowList(userId, type)        // Show followers/following
```

### Real-time
```javascript
initSocket()                        // Initialize Supabase
joinRoom(roomName)                  // Join stream room
sendReaction(emoji)                 // Send reaction
```

### LiveKit
```javascript
connectToLiveKit(token, room)       // Connect to LiveKit
toggleMic()                         // Toggle host mic
toggleCam()                         // Toggle host camera
toggleViewerAudio()                 // Toggle viewer audio
toggleViewerVideo()                 // Toggle viewer video
```

## 📡 API Endpoints

### Auth
```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/me
```

### Streams
```
GET    /api/streams
GET    /api/streams/all
GET    /api/streams/search?q=query
GET    /api/streams/:id
POST   /api/streams
PUT    /api/streams/:id/end
POST   /api/streams/:id/request
PUT    /api/streams/requests/:requestId
GET    /api/streams/:id/requests
PUT    /api/streams/:id/viewers
```

### Gifts
```
GET    /api/gifts
POST   /api/gifts/send
```

### Wallet
```
GET    /api/wallet
POST   /api/wallet/buy
POST   /api/wallet/withdraw
GET    /api/wallet/withdrawals
```

### Users
```
GET    /api/users/profile/:id
PUT    /api/users/profile
POST   /api/users/profile/avatar
POST   /api/users/follow/:id
DELETE /api/users/follow/:id
GET    /api/users/follow-status/:id
GET    /api/users/search?q=query
GET    /api/users/:id/followers
GET    /api/users/:id/following
```

### Messages
```
GET    /api/messages
GET    /api/messages/:partnerId
POST   /api/messages
```

### LiveKit
```
POST   /api/livekit/token
```

## 🎬 Common Workflows

### Login Flow
```
showAuthOverlay('login')
  → User enters email/password
  → POST /api/auth/login
  → saveSession()
  → afterLogin()
  → navigateTo('home')
```

### Watch Stream Flow
```
navigateTo('home')
  → loadStreams()
  → User clicks stream
  → openStream(streamId)
  → GET /api/streams/:id
  → enterLiveScreen()
  → POST /api/livekit/token
  → connectToLiveKit()
  → joinRoom()
```

### Go Live Flow
```
navigateTo('golive')
  → initCamera()
  → User fills form
  → POST /api/streams
  → createStream()
  → enterLiveScreen()
  → connectToLiveKit(canPublish=true)
```

### Send Gift Flow
```
toggleGiftPanel()
  → User clicks gift
  → sendGift(giftId, streamId, receiverId)
  → POST /api/gifts/send
  → Broadcast gift-animation
  → showGiftBurst()
```

### Edit Profile Flow
```
openProfileEditor()
  → showModal('profile-modal')
  → User uploads avatar
  → previewAvatar()
  → User clicks Save
  → saveProfile()
  → POST /api/users/profile/avatar
  → PUT /api/users/profile
  → closeModal('profile-modal')
```

## 🔄 Real-time Events

### Global Channel (`global-updates`)
```javascript
'direct-message'           // Incoming DM
'guest-invite-received'    // Invited to co-stream
'guest-invite-reply'       // Response to invite
'guest-kicked'             // Removed from co-stream
'join-response-{userId}'   // Join request response
```

### Room Channel (`room:{livekit_room}`)
```javascript
'chat-message'             // Chat message
'reaction'                 // Emoji reaction
'gift-animation'           // Gift sent
'stream-ended'             // Stream terminated
'user-joined'              // User joined
'viewer-count'             // Viewer count updated
'join-request-received'    // Join request (host)
'guest-left'               // Guest left
```

## 🎨 CSS Classes

### Screens
```css
.screen              /* Base screen */
.screen.active       /* Visible screen */
.screen.hidden       /* Hidden screen */
.screen-fullscreen   /* Fullscreen (live stream) */
```

### Modals
```css
.modal-overlay       /* Modal background */
.modal-box           /* Modal content */
.hidden              /* Hidden element */
```

### Buttons
```css
.btn-primary         /* Primary action */
.btn-ghost           /* Secondary action */
.btn-danger          /* Destructive action */
.btn-sm              /* Small button */
```

### Cards
```css
.glass               /* Glassmorphism effect */
.stream-card         /* Stream card */
.profile-card        /* Profile card */
```

## 🔐 Authentication

### Token Storage
```javascript
localStorage.getItem('tl_token')           // Get token
localStorage.setItem('tl_token', token)    // Save token
localStorage.removeItem('tl_token')        // Clear token
```

### User Storage
```javascript
localStorage.getItem('tl_user')            // Get user
localStorage.setItem('tl_user', JSON.stringify(user))
localStorage.removeItem('tl_user')         // Clear user
```

### API Headers
```javascript
Authorization: Bearer {token}
Content-Type: application/json
```

## 🐛 Debugging Tips

### Check if element exists
```javascript
console.log($('element-id'));
```

### Check element visibility
```javascript
console.log($('element-id').classList);
```

### Manually show/hide element
```javascript
$('element-id').classList.remove('hidden');
$('element-id').classList.add('hidden');
```

### Check API response
```javascript
const data = await apiReq('GET', '/api/endpoint');
console.log(data);
```

### Check real-time connection
```javascript
console.log('Socket connected:', socketConnected);
console.log('Room channel:', window.roomChannel);
```

### Check user session
```javascript
console.log('Token:', token);
console.log('User:', currentUser);
```

## 📊 Global Variables

```javascript
token                  // JWT token
currentUser            // Current user object
socket                 // Supabase global channel
supabaseClient         // Supabase client
currentStream          // Current stream being watched
currentScreen          // Active screen name
isHost                 // Is current user the host
chatPartnerId          // Current chat partner ID
livekitRoom            // Current LiveKit room name
socketConnected        // Is socket connected
```

## 🎯 Element Selectors

```javascript
$('screen-home')                    // Home screen
$('screen-golive')                  // Go Live screen
$('screen-live')                    // Live stream screen
$('auth-overlay')                   // Auth overlay
$('profile-modal')                  // Profile editor modal
$('withdraw-modal')                 // Withdrawal modal
$('stream-feed')                    // Stream feed container
$('chat-messages')                  // Chat messages container
$('wallet-balance')                 // Wallet balance display
$('profile-username')               // Profile username
```

## 🚀 Quick Start Commands

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## 📱 Responsive Breakpoints

```css
/* Mobile */
@media (max-width: 480px) { }

/* Tablet */
@media (min-width: 481px) and (max-width: 768px) { }

/* Desktop */
@media (min-width: 769px) { }
```

## 🔗 Important Links

- **GitHub**: [MingooLive Repository](https://github.com/your-username/MingooLive)
- **Supabase**: [Dashboard](https://app.supabase.com)
- **LiveKit**: [Dashboard](https://cloud.livekit.io)
- **Vercel**: [Dashboard](https://vercel.com)

## 📞 Common Issues & Solutions

| Issue | Solution |
|---|---|
| Screen not showing | Check if `hidden` class is removed |
| Modal not appearing | Check if `hidden` class is removed |
| API request failing | Check token, API base URL, network |
| Real-time not working | Check Supabase config, socket connection |
| Video not streaming | Check LiveKit token, room name, permissions |
| Chat not updating | Check Supabase Realtime channel subscription |

---

**Last Updated:** May 2026
**Version:** 1.0.0


# MingooLive - Implementation Guide

## Overview

This guide explains how to work with the refactored MingooLive frontend architecture, which separates screens and modals into organized, maintainable components.

---

## 📁 File Structure

```
public/
├── index.html                      # Main HTML file (all screens & modals)
├── app.js                          # Main application logic (2069 lines)
├── style.css                       # Global styles
├── SCREENS_AND_MODALS.md           # Architecture documentation
├── IMPLEMENTATION_GUIDE.md         # This file
│
├── screens/                        # Screen components (separate files)
│   ├── home.html                   # Home screen (browse streams)
│   ├── golive.html                 # Go Live screen (create stream)
│   ├── live.html                   # Live Stream screen (watch/broadcast)
│   ├── chat.html                   # Chat screens (list & thread)
│   ├── wallet.html                 # Wallet screen (coins & transactions)
│   └── profile.html                # Profile screens (my profile, view profile, follow list)
│
└── modals/                         # Modal components (separate files)
    ├── auth.html                   # Auth overlay (login/register)
    ├── guest-timer.html            # Guest timer popup
    ├── profile-editor.html         # Profile editor modal
    └── wallet.html                 # Wallet modals (withdrawal & join request)
```

---

## 🎯 Key Concepts

### 1. Screens vs Modals

**Screens:**
- Full-page views accessed via bottom navigation
- Only one screen visible at a time
- Identified by `id="screen-{name}"`
- Classes: `screen`, `active` (visible), `hidden` (not visible)

**Modals:**
- Overlay dialogs on top of screens
- Can appear on any screen
- Identified by `id="{name}-modal"` or `id="{name}-overlay"`
- Classes: `modal-overlay` or similar, `hidden` (not visible)

### 2. Navigation

**Screen Navigation:**
```javascript
navigateTo(screenName) {
  // Hides all screens, shows target screen
  // Updates bottom nav active state
  // Calls screen-specific setup functions
}
```

**Modal Management:**
```javascript
showModal(id) {
  $(id).classList.remove('hidden');
}

closeModal(id) {
  $(id).classList.add('hidden');
}
```

### 3. Real-time Communication

**Supabase Realtime Channels:**
- `global-updates` - Direct messages, notifications
- `room:{livekit_room}` - Stream chat, reactions, gifts

**LiveKit WebRTC:**
- Video/audio streaming
- Multi-participant support
- Token-based authentication

---

## 🚀 Getting Started

### Step 1: Understand the Architecture

1. Read `SCREENS_AND_MODALS.md` for complete documentation
2. Review the file structure above
3. Examine `index.html` to see how screens/modals are organized

### Step 2: Set Up Development Environment

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Server runs at http://localhost:3000
```

### Step 3: Test the Application

1. Open `http://localhost:3000` in browser
2. Test auth flow: Register → Login → Logout
3. Test navigation: Click bottom nav buttons
4. Test modals: Open profile editor, withdrawal modal, etc.

---

## 📝 Working with Screens

### Adding a New Screen

1. **Create screen file** in `public/screens/`:
```html
<!-- public/screens/mynewscreen.html -->
<section id="screen-mynewscreen" class="screen hidden">
  <div class="screen-inner">
    <h2 class="screen-title">My New Screen</h2>
    <!-- Content here -->
  </div>
</section>
```

2. **Add to index.html** in `<main id="main-content">`:
```html
<!-- Include your new screen -->
<section id="screen-mynewscreen" class="screen hidden">
  <!-- ... -->
</section>
```

3. **Add navigation button** in bottom nav:
```html
<button class="nav-item" data-screen="mynewscreen" onclick="navigateTo('mynewscreen')">
  <span class="nav-icon">🎯</span>
  <span class="nav-label">My Screen</span>
</button>
```

4. **Add handler in app.js**:
```javascript
function navigateTo(screenName) {
  // ... existing code ...
  
  if (screenName === 'mynewscreen') {
    loadMyNewScreenData();
  }
}

function loadMyNewScreenData() {
  // Fetch data and render
}
```

### Modifying an Existing Screen

1. **Locate the screen** in `index.html` (search for `id="screen-{name}"`)
2. **Edit the HTML** directly in `index.html`
3. **Update app.js** if needed (add/modify functions)
4. **Test** in browser

### Screen Lifecycle

```javascript
// When screen is shown
navigateTo('home') {
  // 1. Hide all screens
  // 2. Show target screen
  // 3. Update nav active state
  // 4. Call setup function (e.g., loadStreams())
}

// When screen is hidden
navigateTo('other') {
  // 1. Hide current screen
  // 2. Show new screen
  // 3. Cleanup (stop camera, clear timers, etc.)
}
```

---

## 🎨 Working with Modals

### Adding a New Modal

1. **Create modal file** in `public/modals/`:
```html
<!-- public/modals/mymodal.html -->
<div id="mymodal" class="modal-overlay hidden">
  <div class="modal-box glass">
    <h3>My Modal</h3>
    <p>Content here</p>
    <div class="modal-actions">
      <button class="btn-primary" onclick="handleSave()">Save</button>
      <button class="btn-ghost" onclick="closeModal('mymodal')">Cancel</button>
    </div>
  </div>
</div>
```

2. **Add to index.html** in modals section:
```html
<!-- Modals & Overlays -->
<div id="mymodal" class="modal-overlay hidden">
  <!-- ... -->
</div>
```

3. **Add handler in app.js**:
```javascript
function showMyModal() {
  showModal('mymodal');
}

function handleSave() {
  // Handle save logic
  closeModal('mymodal');
}
```

### Modifying an Existing Modal

1. **Locate the modal** in `index.html` (search for `id="{name}-modal"` or `id="{name}-overlay"`)
2. **Edit the HTML** directly in `index.html`
3. **Update app.js** if needed
4. **Test** in browser

### Modal Lifecycle

```javascript
// Show modal
showModal(id) {
  $(id).classList.remove('hidden');
}

// Close modal
closeModal(id) {
  $(id).classList.add('hidden');
}

// Handle form submission
function handleSubmit() {
  // Validate input
  // Make API call
  // Show success/error
  // Close modal
  closeModal('mymodal');
}
```

---

## 🔌 API Integration

### Making API Requests

```javascript
// Generic API request
const data = await apiReq('GET', '/api/endpoint', body);

// With error handling
try {
  const data = await apiReq('POST', '/api/endpoint', { key: 'value' });
  // Handle success
} catch (err) {
  showError('error-id', err.message);
}
```

### Common API Endpoints

```javascript
// Auth
await apiReq('POST', '/api/auth/register', { username, email, password });
await apiReq('POST', '/api/auth/login', { email, password });
await apiReq('GET', '/api/auth/me');

// Streams
await apiReq('GET', '/api/streams');
await apiReq('POST', '/api/streams', { title, category, type });
await apiReq('PUT', '/api/streams/:id/end');

// Gifts
await apiReq('GET', '/api/gifts');
await apiReq('POST', '/api/gifts/send', { gift_id, stream_id, receiver_id });

// Wallet
await apiReq('GET', '/api/wallet');
await apiReq('POST', '/api/wallet/buy', { coins });
await apiReq('POST', '/api/wallet/withdraw', { amount });

// Users
await apiReq('GET', '/api/users/profile/:id');
await apiReq('PUT', '/api/users/profile', { username, bio });
await apiReq('POST', '/api/users/follow/:id');
await apiReq('DELETE', '/api/users/follow/:id');

// Messages
await apiReq('GET', '/api/messages');
await apiReq('GET', '/api/messages/:partnerId');
await apiReq('POST', '/api/messages', { receiver_id, message });
```

---

## 🔄 Real-time Updates

### Supabase Realtime

```javascript
// Initialize socket
await initSocket();

// Join a room
joinRoom(roomName);

// Listen for events
window.roomChannel.on('broadcast', { event: 'chat-message' }, ({ payload }) => {
  appendChat(payload.username, payload.message);
});

// Send event
window.roomChannel.send({
  type: 'broadcast',
  event: 'chat-message',
  payload: { username, message }
});
```

### LiveKit WebRTC

```javascript
// Get token
const { token } = await apiReq('POST', '/api/livekit/token', {
  room: roomName,
  identity: username,
  canPublish: isHost
});

// Connect
await connectToLiveKit(token, roomName);

// Publish/subscribe
// Handled automatically by LiveKit SDK
```

---

## 🎬 Common Workflows

### Workflow 1: User Registration & Login

```
1. App loads → showAuthOverlay('login')
2. User clicks "Register" → showAuthForm('register')
3. User fills form → submit event
4. POST /api/auth/register → saveSession()
5. afterLogin() → initSocket() → navigateTo('home')
```

### Workflow 2: Browse & Watch Stream

```
1. navigateTo('home') → loadStreams()
2. User clicks stream card → openStream(streamId)
3. GET /api/streams/:id → enterLiveScreen()
4. POST /api/livekit/token → connectToLiveKit()
5. joinRoom() → listen for chat/reactions/gifts
```

### Workflow 3: Go Live & Broadcast

```
1. navigateTo('golive') → initCamera()
2. User fills form → click "GO LIVE"
3. POST /api/streams → createStream()
4. enterLiveScreen() → connectToLiveKit(canPublish=true)
5. Host can toggle mic/camera, end stream
```

### Workflow 4: Send Gift

```
1. In live stream → click gift button
2. toggleGiftPanel() → show gift options
3. User clicks gift → sendGift(giftId, streamId, receiverId)
4. POST /api/gifts/send → debit sender, credit receiver
5. Broadcast gift-animation event → show burst animation
```

### Workflow 5: Edit Profile

```
1. navigateTo('profile') → renderProfile()
2. User clicks "Edit Profile" → openProfileEditor()
3. showModal('profile-modal') → populate form
4. User uploads avatar → previewAvatar()
5. User clicks "Save" → saveProfile()
6. POST /api/users/profile/avatar + PUT /api/users/profile
7. closeModal('profile-modal') → refresh profile
```

---

## 🐛 Debugging

### Common Issues

**Screen not showing:**
```javascript
// Check if screen exists
console.log($('screen-myscreen'));

// Check if hidden class is being removed
console.log($('screen-myscreen').classList);

// Manually show screen
$('screen-myscreen').classList.remove('hidden');
$('screen-myscreen').classList.add('active');
```

**Modal not appearing:**
```javascript
// Check if modal exists
console.log($('mymodal'));

// Check if hidden class is being removed
console.log($('mymodal').classList);

// Manually show modal
$('mymodal').classList.remove('hidden');
```

**API request failing:**
```javascript
// Check network tab in DevTools
// Check API response in console
// Verify token is set
console.log('Token:', token);

// Check API endpoint
console.log('API Base:', API);
```

**Real-time not working:**
```javascript
// Check if socket is connected
console.log('Socket connected:', socketConnected);

// Check if room channel exists
console.log('Room channel:', window.roomChannel);

// Check Supabase config
console.log('Supabase client:', supabaseClient);
```

### Browser DevTools

1. **Console**: Check for errors and logs
2. **Network**: Monitor API requests
3. **Application**: Check localStorage for token/user
4. **Elements**: Inspect HTML structure
5. **Performance**: Monitor performance

---

## 📊 State Management

### Global Variables

```javascript
let token = localStorage.getItem('tl_token');
let currentUser = JSON.parse(localStorage.getItem('tl_user') || 'null');
let socket = null;                    // Supabase global channel
let supabaseClient = null;            // Supabase client
let currentStream = null;             // Current stream being watched
let currentScreen = 'home';           // Active screen
let isHost = false;                   // Is current user the host
let chatPartnerId = null;             // Current chat partner
let livekitRoom = null;               // Current LiveKit room
```

### Persisting State

```javascript
// Save to localStorage
localStorage.setItem('tl_token', token);
localStorage.setItem('tl_user', JSON.stringify(currentUser));

// Load from localStorage
token = localStorage.getItem('tl_token');
currentUser = JSON.parse(localStorage.getItem('tl_user') || 'null');

// Clear on logout
localStorage.removeItem('tl_token');
localStorage.removeItem('tl_user');
```

---

## 🎨 Styling

### CSS Classes

**Screens:**
- `.screen` - Base screen class
- `.active` - Screen is visible
- `.hidden` - Screen is hidden
- `.screen-fullscreen` - Fullscreen screen (live stream)

**Modals:**
- `.modal-overlay` - Modal background
- `.modal-box` - Modal content box
- `.hidden` - Modal is hidden

**Buttons:**
- `.btn-primary` - Primary action
- `.btn-ghost` - Secondary action
- `.btn-danger` - Destructive action
- `.btn-sm` - Small button

**Cards:**
- `.glass` - Glassmorphism effect
- `.stream-card` - Stream card
- `.profile-card` - Profile card

### Responsive Design

The app is mobile-first and responsive:
- Mobile: 320px - 480px
- Tablet: 481px - 768px
- Desktop: 769px+

---

## 🧪 Testing Checklist

### Authentication
- [ ] Register new account
- [ ] Login with email/password
- [ ] Logout
- [ ] Guest mode (5-minute timer)
- [ ] Session persistence (refresh page)

### Navigation
- [ ] Bottom nav buttons work
- [ ] Screen transitions smooth
- [ ] Back buttons work
- [ ] Modal open/close works

### Streams
- [ ] Browse streams by category
- [ ] Search streams and users
- [ ] Open stream and watch
- [ ] Create new stream
- [ ] End stream (host only)
- [ ] Join request flow (private/group)

### Chat
- [ ] View conversations
- [ ] Open conversation thread
- [ ] Send/receive messages
- [ ] Real-time updates

### Gifts
- [ ] View gift catalog
- [ ] Send gift
- [ ] Receive gift notification
- [ ] Gift animation displays

### Wallet
- [ ] View coin balance
- [ ] Buy coins
- [ ] Request withdrawal
- [ ] View transaction history

### Profile
- [ ] View my profile
- [ ] Edit profile (username, bio, avatar)
- [ ] View other user's profile
- [ ] Follow/unfollow user
- [ ] View followers/following

### Real-time
- [ ] Chat messages appear in real-time
- [ ] Reactions display
- [ ] Viewer count updates
- [ ] Join requests notify host

### LiveKit
- [ ] Video/audio streams
- [ ] Host can toggle mic/camera
- [ ] Viewer can mute audio/video
- [ ] Multiple participants (group streams)

---

## 📚 Resources

### Documentation
- [Supabase Docs](https://supabase.com/docs)
- [LiveKit Docs](https://docs.livekit.io)
- [Express.js Docs](https://expressjs.com)

### Related Files
- `README.md` - Project overview
- `SCREENS_AND_MODALS.md` - Architecture documentation
- `supabase_schema.sql` - Database schema
- `server/index.js` - Backend setup

---

## 🔄 Workflow: Adding a New Feature

### Example: Add "Favorites" Feature

1. **Design the feature**
   - Users can favorite streams
   - Favorites appear in a new "Favorites" screen
   - Favorite button on stream cards

2. **Update database** (if needed)
   - Add `favorites` table to Supabase

3. **Create backend API** (if needed)
   - POST /api/favorites - add favorite
   - DELETE /api/favorites/:id - remove favorite
   - GET /api/favorites - get user's favorites

4. **Create frontend screen**
   - Create `public/screens/favorites.html`
   - Add to `index.html`
   - Add navigation button

5. **Add app.js functions**
   - `loadFavorites()` - fetch favorites
   - `renderFavorites()` - render screen
   - `addFavorite(streamId)` - add favorite
   - `removeFavorite(streamId)` - remove favorite

6. **Update stream cards**
   - Add favorite button
   - Call `addFavorite()` / `removeFavorite()`

7. **Test**
   - Add/remove favorites
   - View favorites screen
   - Refresh page (persistence)

---

## 🚀 Deployment

### Vercel Deployment

1. Push code to GitHub
2. Import project in Vercel
3. Set environment variables
4. Deploy

### Environment Variables

```env
SUPABASE_URL=https://...
SUPABASE_KEY=...
LIVEKIT_URL=wss://...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
JWT_SECRET=...
```

---

## 📞 Support

For issues or questions:
1. Check `SCREENS_AND_MODALS.md` for architecture details
2. Review `README.md` for project overview
3. Check browser console for errors
4. Review network requests in DevTools
5. Check Supabase/LiveKit dashboards

---

## 📝 Notes

- All screens and modals are in `index.html` for simplicity
- Separate files in `screens/` and `modals/` are for documentation/organization
- To use separate files, implement a template loader or build process
- Current setup works well for small to medium projects
- For larger projects, consider a framework like React/Vue

---

**Last Updated:** May 2026
**Version:** 1.0.0


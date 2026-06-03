# MingooLive - Live Chat Screen Guide

## 📋 Overview

The **Live Chat Screen** is a dedicated, full-screen chat interface for live stream viewers. It provides a better chat experience with more features and better visibility compared to the inline chat in the live stream screen.

---

## 🎯 Features

### Core Features
- ✅ Full-screen dedicated chat view
- ✅ User avatars and names
- ✅ Message timestamps
- ✅ System messages (user joined, gifts sent, etc.)
- ✅ Real-time message updates
- ✅ Emoji support with emoji picker
- ✅ Message input with character counter
- ✅ Auto-scroll to latest message
- ✅ Typing indicators

### Advanced Features
- ✅ Pinned messages panel
- ✅ Viewer list with online status
- ✅ Chat settings panel
- ✅ Message filtering (all, users, system, gifts)
- ✅ Compact mode for more messages
- ✅ Hide avatars option
- ✅ Mute notifications
- ✅ Show/hide timestamps
- ✅ Clear chat history

---

## 🎨 UI Components

### Chat Header
```
[←] [Stream Title] [👁 0 viewers]     [📌] [👥] [⚙️]
```

**Elements:**
- Back button - Return to live stream
- Stream title - Name of the stream
- Viewer count - Number of active viewers
- Pinned messages button - Show pinned messages
- Viewers button - Show online viewers
- Settings button - Open chat settings

### Chat Messages Area
```
[Avatar] [Username] [Timestamp]
         [Message text...]

[Avatar] [Username] [Timestamp]
         [Message text...]
```

**Message Types:**
- **User Messages** - Regular chat messages
- **System Messages** - User joined, stream ended, etc.
- **Gift Messages** - Gift sent notifications

### Chat Input Area
```
[😊] [Message input...] [0/500] [➤]
```

**Elements:**
- Emoji picker button - Open emoji selector
- Message input - Type your message (max 500 chars)
- Character counter - Show current/max characters
- Send button - Send message

### Emoji Picker
```
[😀] [😂] [❤️] [🔥] [👍] [🎉]
[😍] [🤔] [😎] [🚀] [💯] [🎮]
```

### Pinned Messages Panel
```
┌─────────────────────┐
│ 📌 Pinned Messages  │ [✕]
├─────────────────────┤
│ [Pinned message 1]  │
│ [Pinned message 2]  │
│ [Pinned message 3]  │
└─────────────────────┘
```

### Viewer List Panel
```
┌─────────────────────┐
│ 👥 Viewers          │ [✕]
├─────────────────────┤
│ [Avatar] Username   │
│ [Avatar] Username   │
│ [Avatar] Username   │
└─────────────────────┘
```

### Chat Settings Panel
```
┌─────────────────────┐
│ ⚙️ Chat Settings    │ [✕]
├─────────────────────┤
│ ☐ Mute Notifications│
│ ☐ Hide Avatars      │
│ ☐ Compact Mode      │
│ ☑ Show Timestamps   │
│ Filter: [All ▼]     │
│ [🗑️ Clear Chat]     │
└─────────────────────┘
```

---

## 🔧 Functions

### Navigation Functions

```javascript
// Open dedicated chat screen
openLiveChat()

// Exit chat and return to live stream
exitLiveChat()
```

### Chat Functions

```javascript
// Send message to live chat
sendLiveChatMessage()

// Add message to chat display
appendLiveChat(username, message, isSystem, avatar)

// Clear all messages from chat
clearChatHistory()

// Filter messages by type
filterMessages(type)  // 'all', 'users', 'system', 'gifts'
```

### Panel Functions

```javascript
// Toggle pinned messages panel
togglePinnedMessages()

// Toggle viewer list panel
toggleUserList()

// Toggle chat settings panel
toggleChatSettings()

// Toggle emoji picker
toggleEmojiPicker()

// Insert emoji into message input
insertEmoji(emoji)
```

### Settings Functions

```javascript
// Toggle mute notifications
toggleMuteNotifications()

// Toggle hide avatars
toggleHideAvatars()

// Toggle compact mode
toggleCompactMode()

// Toggle show timestamps
toggleShowTimestamps()
```

---

## 📱 Responsive Design

### Mobile (< 480px)
- Full-width panels
- Smaller emoji picker (4 columns instead of 6)
- Compact padding
- Touch-friendly buttons

### Tablet (481px - 768px)
- Side panels with max-width
- Standard emoji picker
- Normal padding

### Desktop (> 768px)
- Floating panels
- Full emoji picker
- Comfortable spacing

---

## 🔄 Data Flow

### Opening Live Chat

```
User clicks 💬 button in live stream
    ↓
openLiveChat()
    ├─ navigateTo('live-chat')
    ├─ Update chat header with stream info
    ├─ Load existing messages
    ├─ Subscribe to room channel
    └─ Focus on message input
```

### Sending a Message

```
User types message and presses Enter or clicks Send
    ↓
sendLiveChatMessage()
    ├─ Get message text from input
    ├─ Validate message (not empty, max 500 chars)
    ├─ Broadcast to room channel
    ├─ Clear input
    ├─ Update character counter
    └─ Auto-scroll to latest message
```

### Receiving a Message

```
Message received from Supabase Realtime
    ↓
appendLiveChat()
    ├─ Create message element
    ├─ Add avatar, username, timestamp
    ├─ Add message text
    ├─ Apply styling (user/system/gift)
    ├─ Add to messages container
    ├─ Auto-scroll to bottom
    └─ Play notification (if enabled)
```

### Filtering Messages

```
User selects filter option
    ↓
filterMessages(type)
    ├─ Get all messages
    ├─ Filter by type
    ├─ Show/hide messages
    └─ Update display
```

---

## 🎨 Styling

### CSS Classes

**Message Types:**
- `.chat-message` - Regular message
- `.chat-message.system` - System message
- `.chat-message.gift` - Gift message
- `.chat-message.compact` - Compact mode

**Panels:**
- `.pinned-panel` - Pinned messages panel
- `.user-panel` - Viewer list panel
- `.settings-panel` - Settings panel
- `.emoji-picker` - Emoji picker

**States:**
- `.hidden` - Hidden element
- `.active` - Active element

### Color Scheme

```css
--bg-dark              /* Dark background */
--text-primary         /* Primary text */
--text-muted           /* Muted text */
--accent               /* Accent color */
--glass-border         /* Glass border */
```

---

## 🔌 Integration with Live Stream

### Shared Data
- Same room channel (Supabase Realtime)
- Same stream information
- Same user session
- Same message history

### Synchronized Features
- Messages appear in both screens
- Viewer count updates in both screens
- Reactions broadcast to both screens
- Gifts broadcast to both screens

### Navigation
- Open chat from live stream (💬 button)
- Return to live stream (← button)
- Both screens stay in sync

---

## 📊 Message Types

### User Message
```
[Avatar] Username [12:34 PM]
This is a regular chat message
```

### System Message
```
[System] User joined the stream
```

### Gift Message
```
[Avatar] Username sent a 🎁 Diamond gift!
```

### Typing Indicator
```
Someone is typing...
```

---

## ⚙️ Settings

### Mute Notifications
- Disables sound/visual notifications for new messages
- Useful when watching with sound off

### Hide Avatars
- Removes user avatars from messages
- Saves space in compact mode

### Compact Mode
- Reduces padding and font sizes
- Shows more messages on screen
- Useful for high-volume chat

### Show Timestamps
- Displays message timestamps
- Useful for tracking message timing

### Filter Messages
- **All Messages** - Show all messages
- **Users Only** - Show only user messages
- **System Only** - Show only system messages
- **Gifts Only** - Show only gift messages

---

## 🎯 Use Cases

### Use Case 1: Casual Viewing
1. Open live stream
2. Watch video
3. Click 💬 to open chat
4. Read and send messages
5. Click ← to return to stream

### Use Case 2: High-Volume Chat
1. Open live stream
2. Click 💬 to open chat
3. Enable Compact Mode
4. Enable Filter: Users Only
5. Read and send messages

### Use Case 3: Moderation
1. Open live stream
2. Click 💬 to open chat
3. Open Viewer List
4. Monitor active users
5. Manage chat as needed

### Use Case 4: Focused Watching
1. Open live stream
2. Click 💬 to open chat
3. Enable Mute Notifications
4. Enable Hide Avatars
5. Focus on stream

---

## 🔐 Security & Moderation

### Message Validation
- Max 500 characters
- No empty messages
- Profanity filter (optional)
- Rate limiting (optional)

### User Moderation
- Ban users from chat
- Delete messages
- Mute users
- Timeout users

### Admin Features
- Pin important messages
- Delete spam
- Manage user list
- View message history

---

## 📈 Performance

### Optimization
- Lazy load messages (load on scroll)
- Limit visible messages (e.g., last 100)
- Debounce typing indicators
- Optimize re-renders

### Scalability
- Handle 1000+ concurrent users
- Support high message volume
- Efficient real-time updates
- Minimal bandwidth usage

---

## 🐛 Troubleshooting

### Messages Not Appearing
1. Check internet connection
2. Verify Supabase connection
3. Check room channel subscription
4. Refresh page

### Emoji Picker Not Working
1. Check browser support
2. Verify emoji data loaded
3. Check CSS loaded
4. Try different emoji

### Settings Not Saving
1. Check localStorage
2. Verify settings panel open
3. Check browser console for errors
4. Try clearing cache

### Chat Lag
1. Close other tabs
2. Disable compact mode
3. Filter messages
4. Reduce emoji usage

---

## 📚 Related Documentation

- **SCREENS_AND_MODALS.md** - Overall architecture
- **IMPLEMENTATION_GUIDE.md** - How to add features
- **QUICK_REFERENCE.md** - Quick function lookup
- **ARCHITECTURE.md** - Data flow diagrams

---

## 🎓 Examples

### Example 1: Send a Message

```javascript
// User types "Hello everyone!" and presses Enter
sendLiveChatMessage()
  ├─ Get text: "Hello everyone!"
  ├─ Validate: ✓ (not empty, < 500 chars)
  ├─ Broadcast to room
  ├─ Clear input
  └─ Auto-scroll to message
```

### Example 2: Filter Messages

```javascript
// User selects "Gifts Only"
filterMessages('gifts')
  ├─ Get all messages
  ├─ Filter: keep only gift messages
  ├─ Hide user/system messages
  └─ Update display
```

### Example 3: Toggle Compact Mode

```javascript
// User enables compact mode
toggleCompactMode()
  ├─ Add .compact class to messages
  ├─ Reduce padding/font sizes
  ├─ Show more messages
  └─ Save setting to localStorage
```

---

## 🚀 Future Enhancements

### Planned Features
- [ ] Message reactions (👍, ❤️, etc.)
- [ ] User mentions (@username)
- [ ] Message search
- [ ] Chat history export
- [ ] Custom emojis
- [ ] Message threading
- [ ] Chat moderation tools
- [ ] Chat bots
- [ ] Message translation
- [ ] Accessibility improvements

### Potential Improvements
- [ ] Better emoji picker (search, categories)
- [ ] Message editing
- [ ] Message deletion
- [ ] User profiles in chat
- [ ] Chat badges (moderator, verified, etc.)
- [ ] Chat animations
- [ ] Dark/light theme toggle
- [ ] Chat sounds
- [ ] Chat notifications
- [ ] Chat analytics

---

## 📞 Support

### Common Questions

**Q: How do I open the chat?**
A: Click the 💬 button in the live stream screen.

**Q: How do I send a message?**
A: Type your message and press Enter or click the ➤ button.

**Q: How do I use emojis?**
A: Click the 😊 button to open the emoji picker, then click an emoji.

**Q: How do I filter messages?**
A: Click ⚙️ to open settings, then select a filter option.

**Q: How do I go back to the stream?**
A: Click the ← button in the chat header.

**Q: Can I delete my message?**
A: Not yet, but this feature is planned.

**Q: Can I edit my message?**
A: Not yet, but this feature is planned.

---

**Last Updated:** May 12, 2026
**Version:** 1.0.0
**Status:** ✅ Complete


# Gift System End-to-End Test Guide

## Setup Requirements

### Database Setup
Ensure these tables exist in Supabase:

#### `gifts` table
```sql
CREATE TABLE gifts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  icon VARCHAR(10) NOT NULL,
  coin_cost INT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insert test gifts
INSERT INTO gifts (name, icon, coin_cost) VALUES
  ('Rose', '🌹', 10),
  ('Diamond', '💎', 50),
  ('Heart', '❤️', 20),
  ('Fire', '🔥', 15),
  ('Fireworks', '🎆', 100),
  ('Trophy', '🏆', 75);
```

#### `transactions` table
```sql
CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  sender_id INT NOT NULL REFERENCES users(id),
  receiver_id INT NOT NULL REFERENCES users(id),
  gift_id INT NOT NULL REFERENCES gifts(id),
  stream_id VARCHAR(255),
  amount INT NOT NULL,
  type VARCHAR(50) DEFAULT 'gift',
  gift_name VARCHAR(100),
  gift_icon VARCHAR(10),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_receiver_id ON transactions(receiver_id);
CREATE INDEX idx_stream_id ON transactions(stream_id);
```

### Server Setup
1. Ensure `.env` has:
   - `SUPABASE_URL=<your_supabase_url>`
   - `SUPABASE_KEY=<your_supabase_key>`
   - `JWT_SECRET=<your_jwt_secret>`
   - `LIVEKIT_URL=<your_livekit_url>`

2. Start server:
   ```bash
   npm install
   npm start
   # or for development:
   npm run dev
   ```

## Test Scenarios

### Scenario 1: Guest User Viewing Gift Panel
**Objective**: Verify gift panel loads and displays gifts without authentication

**Steps**:
1. Open app in new browser (incognito window)
2. Go to home page (should not require login)
3. Find any active stream
4. Click to enter stream
5. Look for gift panel on right side
6. Verify 6 gifts are displayed with icons and costs

**Expected Results**:
- ✅ Gift panel visible on right sidebar
- ✅ 6 gift items displayed (Rose, Diamond, Heart, Fire, Fireworks, Trophy)
- ✅ Each gift shows icon and coin cost
- ✅ Send Gift button is disabled (grayed out)
- ✅ Console shows `[Gift] Gifts loaded: [...]`

---

### Scenario 2: Selecting a Gift
**Objective**: Verify gift selection works and state is maintained

**Steps**:
1. (Logged in as viewer, on active stream)
2. Click on "Rose" gift (10 coins)
3. Verify visual feedback
4. Click on different gift
5. Verify previous selection is cleared

**Expected Results**:
- ✅ Clicked gift has yellow highlight (selected state)
- ✅ Send Gift button becomes enabled
- ✅ Gift name, cost, and icon are logged:
  ```
  [Gift] Gift selected: {
    id: 1,
    name: 'Rose',
    cost: 10,
    icon: '🌹'
  }
  ```
- ✅ Previous gift loses highlight
- ✅ New gift gets highlight

**Console Logs Expected**:
```
[Gift] selectViewerGift called: 1
[Gift] Gift selected: {id: 1, name: 'Rose', cost: 10, icon: '🌹'}
Send button state updated. Disabled: false
```

---

### Scenario 3: Insufficient Coins
**Objective**: Verify user cannot send gift without enough coins

**Steps**:
1. (Logged in as viewer with < 10 coins)
2. Click on "Rose" gift (10 coins)
3. Click Send Gift button
4. Observe error message

**Expected Results**:
- ✅ Error message appears: "Not enough coins to send this gift. Need 10, you have X."
- ✅ Error displayed in red in gift panel
- ✅ Gift panel remains open
- ✅ Selection remains active
- ✅ Console shows error:
  ```
  [Gift] Checking balance. Sender balance: 5 Gift cost: 10
  Not enough coins to send this gift. Need 10, you have 5.
  ```

---

### Scenario 4: Successful Gift Send (Viewer Side)
**Objective**: Verify gift sends successfully and state updates

**Prerequisites**:
- Viewer user has 50+ coins
- Host is actively streaming
- 2 browser windows: Host and Viewer

**Steps**:
1. (Viewer) Select "Diamond" gift (50 coins)
2. (Viewer) Click Send Gift
3. Observe loading state
4. Wait for success message
5. Verify balance updated

**Expected Results**:
- ✅ Send Gift button shows "🎁 Sending..." and is disabled
- ✅ No errors in console during send
- ✅ Success message appears (green): "🎉 Diamond sent successfully!"
- ✅ Success message disappears after 3 seconds
- ✅ Gift burst animation plays (diamond emoji bouncing from bottom)
- ✅ Send button returns to normal state
- ✅ Gift selection is cleared (no highlight)
- ✅ Console shows:
  ```
  [Gift] Sending gift payload to /api/gifts/send...
  {
    gift_id: 2,
    stream_id: '<room_id>',
    receiver_id: <host_id>
  }
  [Gift] API response received: {...}
  [Gift] Gift sent successfully. Broadcasting event...
  [Gift] User balance updated. Previous: 50 New: 0
  ```

---

### Scenario 5: Successful Gift Send (Host Side)
**Objective**: Verify host receives gift notification in real-time

**Prerequisites**:
- Scenario 4 completed
- Host window should receive event

**Expected Results**:
- ✅ Gift burst animation plays on host's screen
- ✅ Gift appears in activity feed: "Viewer sent you 💎 Diamond"
- ✅ Host's coin balance increases by 50 (in profile/wallet)
- ✅ Console shows on host:
  ```
  [Socket] Gift received: {
    sender: 'ViewerUsername',
    receiver: 'HostUsername',
    gift: {id: 2, name: 'Diamond', icon: '💎', coin_cost: 50}
  }
  ```

---

### Scenario 6: Network Error Handling
**Objective**: Verify graceful error handling on network failures

**Steps**:
1. Open DevTools (F12) > Network
2. Set throttling to "Offline"
3. (Viewer) Select a gift and click Send
4. Observe error message
5. Re-enable network
6. Try again

**Expected Results**:
- ✅ Error message appears: "Failed to send gift. Please try again."
- ✅ Send button returns to normal state
- ✅ Selection remains active
- ✅ Can retry without refreshing page
- ✅ On retry with network restored, send succeeds

---

### Scenario 7: Invalid Receiver (Self-send Prevention)
**Objective**: Verify user cannot send gift to own stream

**Prerequisites**:
- Same user is host of a stream

**Steps**:
1. (Same user) Start a stream (become host)
2. Look at right panel (host view)
3. Try to gift to self (no gift button visible for host)

**Expected Results**:
- ✅ Gift send button not available to host on own stream
- ✅ OR if attempt made: "You cannot send gifts to your own stream."

---

### Scenario 8: Multiple Rapid Clicks
**Objective**: Verify duplicate prevention works

**Steps**:
1. (Viewer) Select gift
2. Click Send Gift button 3 times rapidly
3. Observe only one request is sent

**Expected Results**:
- ✅ Only one API request is sent
- ✅ Button is disabled during first send
- ✅ Second and third clicks have no effect
- ✅ Console shows `Already sending a gift, ignoring duplicate request`

---

### Scenario 9: Stream Switch
**Objective**: Verify gift selection resets when switching streams

**Steps**:
1. Enter Stream A (Viewer)
2. Select a gift
3. Navigate back to home
4. Enter different Stream B
5. Check gift selection

**Expected Results**:
- ✅ Gift selection is cleared
- ✅ Send Gift button is disabled
- ✅ Console shows reset:
  ```
  [Live] Viewer mode detected, loading gifts
  ```

---

### Scenario 10: Database Verification
**Objective**: Verify transaction is recorded correctly

**Steps**:
1. Execute gift send (Scenario 4)
2. Query database:
   ```sql
   SELECT * FROM transactions 
   ORDER BY created_at DESC 
   LIMIT 5;
   ```

**Expected Results**:
- ✅ Latest transaction exists with:
  - `sender_id` = viewer's user id
  - `receiver_id` = host's user id
  - `gift_id` = selected gift id
  - `stream_id` = current stream id
  - `amount` = gift coin_cost
  - `type` = 'gift'
  - `gift_name` = gift name
  - `gift_icon` = gift emoji

---

## Performance Checks

### Memory Leaks
1. Open DevTools > Memory
2. Take heap snapshot before
3. Send 5 gifts
4. Take heap snapshot after
5. Compare - should show minimal increase

**Expected**: < 2MB additional memory

### Event Listener Count
1. Open DevTools > Console
2. Run:
   ```javascript
   document.getElementById('viewer-gift-list').getEventListeners('click')
   ```
3. Should return array with only 1 listener

**Expected**: Exactly 1 event listener (delegation)

---

## Browser Compatibility

Test on:
- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Mobile Chrome (latest)

---

## Common Issues & Troubleshooting

### Issue: Gift panel not visible
**Solution**: 
- Check CSS display property
- Verify `viewer-gift-panel` element exists in DOM
- Check console for errors

### Issue: API returns 404 Gift not found
**Solution**:
- Verify gifts table has data
- Check gift_id in payload matches database
- Run: `SELECT * FROM gifts;`

### Issue: Host doesn't receive gift
**Solution**:
- Check roomChannel is subscribed
- Verify gift-animation listener is registered
- Check both users are in same room
- Check Socket status: `socketConnected === true`

### Issue: Balance doesn't update
**Solution**:
- Check balance functions in backend
- Verify coins debit/credit executed
- Check user balance in database after transaction

---

## Debugging Commands

**View all active event listeners**:
```javascript
console.log(getEventListeners(document.getElementById('viewer-gift-list')));
```

**Check gift cache**:
```javascript
console.log('Gift cache:', viewerGiftsCache);
```

**Check selected state**:
```javascript
console.log('Selected:', {
  selectedGiftId,
  selectedViewerGift,
  selectedGiftCost,
  selectedGiftIcon
});
```

**Simulate sending gift**:
```javascript
selectedViewerGift = viewerGiftsCache[0];
selectedGiftId = viewerGiftsCache[0].id;
selectedGiftCost = viewerGiftsCache[0].coin_cost;
selectedGiftIcon = viewerGiftsCache[0].icon;
await sendViewerGift();
```

**Check API directly**:
```javascript
await fetch('/api/gifts').then(r => r.json()).then(console.log);
```

---

## Reporting Issues

When reporting issues, include:
1. Browser and version
2. Console error messages (full stack trace)
3. Network tab request/response
4. Steps to reproduce
5. Expected vs actual behavior
6. Screenshot or recording


/* ═══════════════════════════════════════════════════════════════
   chatUI.js
   Handles UI rendering and events for Direct Messaging.
   ═══════════════════════════════════════════════════════════════ */

const ChatUI = (() => {
    let activeRoomId = null;

    /**
     * Renders the chat list screen
     */
    async function renderChatList() {
        if (!currentUser) {
            $('chat-list').innerHTML = '<div class="profile-guest"><span class="empty-icon"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span><p>Login to chat with others</p></div>';
            return;
        }
        
        try {
            const convos = await ChatService.fetchRecentChats(currentUser.id);
            const list = $('chat-list');
            if (!convos.length) {
                list.innerHTML = '<div class="empty-state"><span class="empty-icon"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span><p>No messages yet</p></div>';
                return;
            }
            list.innerHTML = convos.map(c => {
                const initials = c.partner_name ? c.partner_name.charAt(0).toUpperCase() : '?';
                const partnerAvatarUrl = toAssetUrl(c.partner_avatar);
                const avatarStyle = partnerAvatarUrl ? `background-image:url(${partnerAvatarUrl}); background-size:cover; background-position:center;` : '';
                return `
          <div class="chat-list-item glass" onclick="ChatUI.openChatThread(${c.partner_id}, '${c.partner_name}', '${c.partner_avatar || ''}')" style="display:flex;align-items:center;padding:12px;border-radius:12px;gap:12px;cursor:pointer">
             <div class="profile-avatar-lg" style="width:48px;height:48px;font-size:1.2rem;background:linear-gradient(135deg,#c084fc,#818cf8);${avatarStyle}">${partnerAvatarUrl ? '' : initials}</div>
             <div style="flex:1">
               <div style="font-weight:600;margin-bottom:4px;color:var(--text)">${c.partner_name}</div>
               <div style="color:var(--text);opacity:0.7;font-size:0.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;">${c.last_message}</div>
             </div>
             <div style="font-size:0.75rem;color:var(--text);opacity:0.5">${formatTime(c.time)}</div>
             ${!c.is_read && c.partner_id !== currentUser.id ? '<div style="width:8px;height:8px;background:var(--accent);border-radius:50%"></div>' : ''}
          </div>
        `;
            }).join('');
        } catch (err) {
            console.error(err);
        }
    }

    /**
     * Opens a specific chat thread
     */
    async function openChatThread(partnerId, partnerName, partnerAvatar = '') {
        chatPartnerId = partnerId;
        activeRoomId = ChatService.getRoomId(currentUser.id, partnerId);
        
        $('chat-thread-partner-name').textContent = partnerName;
        setAvatar($('chat-thread-partner-avatar'), partnerAvatar, partnerName);
        $('chat-thread-messages').innerHTML = '<div class="feed-loading"><div class="spinner"></div><p>Loading messages...</p></div>';
        navigateTo('chat-thread');

        try {
            // Fetch old messages
            const messages = await ChatService.fetchChatHistory(activeRoomId);
            renderThreadMessages(messages);
            
            // Subscribe to realtime updates for this room
            ChatService.subscribeToRoom(activeRoomId, handleIncomingMessage);
        } catch (err) {
            console.error(err);
        }
    }

    /**
     * Renders a list of messages into the thread container
     */
    function renderThreadMessages(messages) {
        const box = $('chat-thread-messages');
        box.innerHTML = messages.map(m => generateMessageHtml(m)).join('');
        scrollToBottom(box);
    }

    /**
     * Handles receiving a new message via real-time subscription
     */
    function handleIncomingMessage(message) {
        // Only render if it belongs to the active thread
        if (message.room_id !== activeRoomId) return;

        const box = $('chat-thread-messages');
        box.insertAdjacentHTML('beforeend', generateMessageHtml(message));
        scrollToBottom(box);
    }

    function generateMessageHtml(m) {
        const isMe = m.sender_id === currentUser.id;
        return `
      <div style="align-self: ${isMe ? 'flex-end' : 'flex-start'}; background: ${isMe ? 'var(--accent)' : 'var(--bg-card)'}; padding: 10px 14px; border-radius: 18px; border-bottom-${isMe ? 'right' : 'left'}-radius: 4px; max-width: 80%; border: 1px solid var(--glass-border)">
        ${!isMe ? `<div style="font-size: 0.75rem; font-weight: bold; margin-bottom: 2px; color: var(--accent2)">${m.sender_username}</div>` : ''}
        <div style="font-size: 0.9rem">${m.message}</div>
        <div style="font-size: 0.65rem; opacity: 0.5; margin-top: 4px; text-align: right">${formatTime(m.created_at)}</div>
      </div>
    `;
    }

    /**
     * Sends a direct message
     */
    async function sendDirectMessage() {
        const input = $('chat-thread-input');
        const msgText = input.value.trim();
        if (!msgText || !activeRoomId || !chatPartnerId) return;

        input.value = ''; // Optimistic clear
        
        try {
            await ChatService.sendMessage(
                activeRoomId,
                currentUser.id,
                currentUser.username,
                msgText
            );
            // We don't render manually here because the realtime subscription
            // will broadcast it back to us and handleIncomingMessage will render it.
        } catch (err) {
            console.error('Failed to send direct message:', err);
            alert('Could not send message: ' + (err.message || err.details || 'Unknown error'));
        }
    }
    
    /**
     * Clean up subscriptions when leaving thread
     */
    function closeChatThread() {
        ChatService.unsubscribeFromRoom();
        activeRoomId = null;
        chatPartnerId = null;
    }
    
    function scrollToBottom(el) {
        el.scrollTop = el.scrollHeight;
    }

    function formatTime(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    return {
        renderChatList,
        openChatThread,
        sendDirectMessage,
        closeChatThread
    };
})();

// Attach globally for inline HTML event handlers (e.g., onclick="sendDirectMessage()")
window.sendDirectMessage = ChatUI.sendDirectMessage;
window.renderChatList = ChatUI.renderChatList;
window.openChatThread = ChatUI.openChatThread;

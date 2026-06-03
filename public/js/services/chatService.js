/* ═══════════════════════════════════════════════════════════════
   chatService.js
   Handles all Supabase interactions for direct messaging.
   ═══════════════════════════════════════════════════════════════ */

const ChatService = (() => {
    let currentSubscription = null;

    /**
     * Generates a consistent room ID for two users.
     * Always sorts IDs so user1 and user2 always get the same room ID regardless of who initiates.
     */
    function getRoomId(userId1, userId2) {
        const minId = Math.min(Number(userId1), Number(userId2));
        const maxId = Math.max(Number(userId1), Number(userId2));
        return `chat_${minId}_${maxId}`;
    }

    /**
     * Subscribe to real-time message inserts for a specific room.
     */
    function subscribeToRoom(roomId, onMessageReceived) {
        if (!supabaseClient) {
            console.error("Supabase client not initialized.");
            return null;
        }

        // Unsubscribe from previous room if any
        if (currentSubscription) {
            supabaseClient.removeChannel(currentSubscription);
        }

        currentSubscription = supabaseClient
            .channel(`room:${roomId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `room_id=eq.${roomId}`
                },
                (payload) => {
                    onMessageReceived(payload.new);
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log(`Subscribed to real-time chat for room: ${roomId}`);
                }
            });

        return currentSubscription;
    }

    /**
     * Unsubscribe from the current room.
     */
    function unsubscribeFromRoom() {
        if (currentSubscription && supabaseClient) {
            supabaseClient.removeChannel(currentSubscription);
            currentSubscription = null;
        }
    }

    /**
     * Fetch previous messages for a specific room.
     */
    async function fetchChatHistory(roomId) {
        if (!supabaseClient) return [];
        
        try {
            const { data, error } = await supabaseClient
                .from('messages')
                .select('*')
                .eq('room_id', roomId)
                .order('created_at', { ascending: true });

            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error("Failed to fetch chat history:", err);
            return [];
        }
    }

    /**
     * Fetch list of recent chats for the current user.
     */
    async function fetchRecentChats(userId) {
         if (!supabaseClient) return [];
         
         try {
             // Using the RPC created in supabase_schema.sql
             const { data, error } = await supabaseClient.rpc('get_recent_chats', { p_user_id: userId });
                 
             if (error) throw error;
             
             return data || [];
         } catch(err) {
             console.error("Fetch recent chats err:", err);
             return [];
         }
    }

    /**
     * Send a new direct message.
     */
    async function sendMessage(roomId, senderId, senderUsername, messageText) {
        if (!supabaseClient || !messageText.trim()) return null;

        try {
            const { data, error } = await supabaseClient
                .from('messages')
                .insert([{
                    room_id: roomId,
                    sender_id: senderId,
                    sender_username: senderUsername,
                    message: messageText.trim()
                }])
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (err) {
            console.error("Failed to send message:", err);
            throw err;
        }
    }

    return {
        getRoomId,
        subscribeToRoom,
        unsubscribeFromRoom,
        fetchChatHistory,
        fetchRecentChats,
        sendMessage
    };
})();

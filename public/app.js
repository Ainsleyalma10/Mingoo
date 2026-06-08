/* ═══════════════════════════════════════════════════════════════
   MingooLive – app.js
   Main SPA logic: auth, navigation, streams, socket.io, gifts
═══════════════════════════════════════════════════════════════ */

const RAW_API_BASE = (window.__APP_CONFIG__?.apiBase || '').trim();
const API = RAW_API_BASE.replace(/\/+$/, '');
let token = localStorage.getItem('tl_token');
let currentUser = JSON.parse(localStorage.getItem('tl_user') || 'null');
let socket = null; // This will now hold the Supabase Channel instance
let supabaseClient = null; // Supabase client instance
let currentStream = null;  // stream object being watched
let profileStatsTimer = null;
let chatPartnerId = null; // Currently chatting with this user ID
let socketConnected = false;
let isHost = false;
let guestTimerInterval = null;
let pendingJoinRequest = null; // { userId, streamId, socket_id }
let livekitRoom = null;
let pendingGuestInvite = null; // { hostId, roomName }
let isGuestStreamer = false;
let activeGuestIds = new Set(); // To track UI elements for guests
let cachedLivekitUrl = null;
let currentScreen = 'home'; // Tracking the active screen state
let livekitConnectSeq = 0;
let lastManualLivekitDisconnectAt = 0;
let isGoLiveInProgress = false;
let isGiftSending = false;
let homeRefreshTimer = null;

// New livestream host analytics states
let streamPeakViewers = 0;
let streamTotalJoins = 0;
let giftActivityData = [];
let activityFeedData = [];

// ─── UTILITY ─────────────────────────────────────────────────────────
const $ = (id) => {
    const liveIds = [
        'video-area', 'video-placeholder', 'connection-overlay', 'reaction-overlay',
        'hud-title', 'hud-viewers', 'host-controls', 'viewer-controls',
        'hud-mic-btn', 'hud-cam-btn', 'viewer-mic-btn', 'viewer-cam-btn',
        'hud-host-avatar', 'hud-host-name', 'hud-follow-btn', 'gift-panel', 'gift-list',
        'end-stream-btn', 'chat-messages', 'chat-input', 'chat-send-btn',
        'camera-device-select', 'mic-device-select', 'mirror-btn',
        'join-request-toast', 'join-req-username', 'send-gift-btn', 'gift-error'
    ];
    if (typeof currentScreen !== 'undefined' && currentScreen === 'live' && liveIds.includes(id)) {
        const prefix = (typeof isHost !== 'undefined' && isHost) ? 'host-' : 'viewer-';
        const el = document.getElementById(prefix + id);
        if (el) return el;
    }
    return document.getElementById(id);
};
const isMobileDevice = () =>
    /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent || '');
const toAssetUrl = (url) => {
    if (!url) return '';
    if (/^(https?:)?\/\//i.test(url) || /^data:|^blob:/i.test(url)) return url;
    if (!API) return url;
    if (url.startsWith('/')) return `${API}${url}`;
    return `${API}/${url}`;
};
const formatRelativeTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Active now';
    if (diffMins < 60) return `Active ${diffMins}m ago`;
    if (diffHours < 24) return `Active ${diffHours}h ago`;
    if (diffDays === 1) return 'Active yesterday';
    return `Active ${diffDays}d ago`;
};
const apiReq = async (method, path, body) => {
    try {
        const res = await fetch(API + path, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        const data = await res.json();
        if (!res.ok) {
            console.error(`[API Error] ${method} ${path}:`, data.message || res.statusText);
            throw new Error(data.message || `Request failed with status ${res.status}`);
        }
        return data;
    } catch (err) {
        if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
            showGlobalError('Network error: Please check your internet connection or server status.');
        } else {
            // Re-throw to be handled by the caller (like login-form submit)
            throw err;
        }
    }
};

function showGlobalError(msg) {
    const container = $('global-error-container') || createGlobalErrorContainer();
    container.textContent = msg;
    container.classList.remove('hidden');
    container.style.display = 'block';
    setTimeout(() => {
        container.style.display = 'none';
        container.classList.add('hidden');
    }, 5000);
}

function createGlobalErrorContainer() {
    const div = document.createElement('div');
    div.id = 'global-error-container';
    div.className = 'global-error-toast hidden';
    div.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #ff4d4d;
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        font-weight: 600;
        display: none;
    `;
    document.body.appendChild(div);
    return div;
}

// ─── SUPABASE / REALTIME INIT ─────────────────────────────────────────
async function initSocket() {
    if (socket) return;

    // Fetch config if not already available
    if (!supabaseClient) {
        try {
            const config = await apiReq('GET', '/api/config');
            if (!config.supabaseUrl || !config.supabaseKey) {
                console.error('Supabase config missing');
                return;
            }
            // Use the global 'supabase' object from the CDN script to create a client
            supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseKey);
        } catch (err) {
            console.error('Failed to load Supabase config:', err);
            return null;
        }
    }

    // Main global channel for direct messages and notifications
    const globalChannel = supabaseClient.channel('global-updates', {
        config: { broadcast: { self: true } }
    });

    globalChannel
        .on('broadcast', { event: 'guest-invite-received' }, ({ payload }) => {
            if (isGuestStreamer) return;
            pendingGuestInvite = payload;
            $('guest-invite-msg').textContent = `${payload.hostName} invited you to go live!`;
            $('guest-invite-toast').classList.remove('hidden');
            setTimeout(() => $('guest-invite-toast').classList.add('hidden'), 20000);
        })
        .on('broadcast', { event: 'guest-invite-reply' }, ({ payload }) => {
            if (payload.accepted) {
                appendChat('System', `🎉 ${payload.username} accepted your invite and is joining!`, true);
            } else {
                appendChat('System', `❌ ${payload.username} declined your invitation.`, true);
            }
        })
        .on('broadcast', { event: 'guest-kicked' }, ({ payload }) => {
            if (isGuestStreamer) {
                alert('The host has ended your guest session.');
                stopGuestStream();
            }
        })
        .on('broadcast', { event: 'private-call-request' }, ({ payload }) => {
            handleIncomingCallRequest(payload);
        })
        .on('broadcast', { event: 'private-call-accepted' }, ({ payload }) => {
            handleCallAccepted(payload);
        })
        .on('broadcast', { event: 'private-call-rejected' }, ({ payload }) => {
            handleCallRejected(payload);
        })
        .on('broadcast', { event: 'private-call-cancelled' }, ({ payload }) => {
            handleCallCancelled(payload);
        })
        .on('broadcast', { event: 'private-call-ended' }, ({ payload }) => {
            handleCallEnded(payload);
        });

    if (currentUser) {
        globalChannel.on('broadcast', { event: `join-response-${currentUser.id}` }, ({ payload }) => {
            $('joinreq-status').textContent = payload.approved ? '✅ Approved! Joining...' : '❌ Host denied your request.';
            if (payload.approved && currentStream) {
                setTimeout(async () => {
                    closeModal('joinreq-modal');
                    try {
                        await enterLiveScreen(currentStream);
                    } catch (err) {
                        console.error('Failed to enter approved stream:', err);
                    }
                }, 1000);
            }
        });
    }

    globalChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
            socketConnected = true;
            console.log('Supabase Realtime connected');
        }
    });

    socket = globalChannel; // Store global channel as the default socket
    return socket;
}

async function joinRoom(roomName) {
    if (!supabaseClient) {
        await initSocket();
    }
    if (!supabaseClient || !roomName) {
        console.error('[Socket] Cannot join room: client or roomName missing', { roomName });
        return;
    }

    // Leave old room channel if exists
    if (window.roomChannel) {
        console.log('[Socket] Leaving previous channel:', window.roomChannel.topic);
        window.roomChannel.unsubscribe();
    }

    console.log('[Socket] Joining channel:', roomName);
    const channel = supabaseClient.channel(roomName, {
        config: {
            broadcast: { self: true },
            presence: { key: currentUser ? String(currentUser.id) : 'guest-' + Math.random().toString(36).substr(2, 5) }
        }
    });

    channel
        .on('broadcast', { event: 'chat-message' }, ({ payload }) => {
            console.log('[Socket] Chat message received:', payload);
            appendChat(payload.username, payload.message, false, payload.avatar);
        })
        .on('broadcast', { event: 'reaction' }, ({ payload }) => {
            if (currentScreen === 'live' && currentStream?.livekit_room === roomName) {
                showFloatingReaction(payload.emoji);
            }
        })
        .on('broadcast', { event: 'gift-animation' }, ({ payload }) => {
            console.log('[Socket] Gift received:', payload);
            showGiftBurst(payload.gift.icon, payload.sender, payload.gift.name);
            if (isHost) {
                addGiftActivityItem(payload.sender, payload.gift.name, 1);
                addActivityFeedItem('gift', `${payload.sender} sent you ${payload.gift.icon} ${payload.gift.name}`);
                updateHostAnalyticsUI();
            }
        })
        .on('broadcast', { event: 'stream-ended' }, ({ payload }) => {
            if (!isHost) {
                alert(payload.message || 'Stream has ended.');
                leaveLiveScreen();
            }
        })
        .on('broadcast', { event: 'user-joined' }, ({ payload }) => {
            console.log('[Socket] User joined event:', payload);
            appendChat('System', `${payload.username} joined 🎉`, true);
            if (isHost) {
                streamTotalJoins++;
                addActivityFeedItem('join', `${payload.username} joined the stream`);
                updateHostAnalyticsUI();
            }
        })
        .on('broadcast', { event: 'follow' }, ({ payload }) => {
            if (isHost) {
                addActivityFeedItem('follow', `${payload.username} followed you!`);
                updateHostAnalyticsUI();
            }
        })
        .on('broadcast', { event: 'join-request-received' }, ({ payload }) => {
            if (isHost) {
                showJoinRequestToast(payload.userId, payload.username, payload.streamId, payload.requestId);
                addActivityFeedItem('join-request', `${payload.username} requested to join`);
                updateHostAnalyticsUI();
            }
        })
        .on('broadcast', { event: 'guest-left' }, ({ payload }) => {
            removeGuestVideo(payload.userId);
        })
        .on('presence', { event: 'sync' }, () => {
            const state = channel.presenceState();
            const count = Object.keys(state).length;
            console.log('[Socket] Presence sync. Current count:', count, state);
            const hudViewersEl = $('hud-viewers');
            if (hudViewersEl) hudViewersEl.textContent = count;

            // Sync viewer count to DB (if host)
            if (isHost && currentStream) {
                apiReq('PUT', `/api/streams/${currentStream.id}/viewers`, { count }).catch(() => { });
                streamPeakViewers = Math.max(streamPeakViewers, count);
                updateHostAnalyticsUI();
            }
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
            console.log('[Socket] Presence join:', key, newPresences);
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
            console.log('[Socket] Presence leave:', key, leftPresences);
        });

    channel.subscribe(async (status) => {
        console.log('[Socket] Subscription status for', roomName, ':', status);
        if (status === 'SUBSCRIBED') {
            console.log('[Socket] Successfully subscribed to', roomName);
            
            // Broadcast join event
            channel.send({
                type: 'broadcast',
                event: 'user-joined',
                payload: { username: currentUser ? currentUser.username : 'Guest' }
            });

            // Start tracking presence
            const presenceTrack = {
                user_id: currentUser ? currentUser.id : null,
                username: currentUser ? currentUser.username : 'Guest',
                online_at: new Date().toISOString(),
            };
            
            const trackStatus = await channel.track(presenceTrack);
            console.log('[Socket] Presence track status:', trackStatus);
        } else if (status === 'CHANNEL_ERROR') {
            console.error('[Socket] Channel error occurred for', roomName);
        } else if (status === 'TIMED_OUT') {
            console.error('[Socket] Subscription timed out for', roomName);
        }
    });

    window.roomChannel = channel;
}

// ─── HOST ANALYTICS HELPERS ──────────────────────────────────────────
function addGiftActivityItem(username, giftName, quantity = 1) {
    const existing = giftActivityData.find(g => g.username === username && g.giftName === giftName);
    if (existing) {
        existing.quantity += quantity;
    } else {
        giftActivityData.unshift({ username, giftName, quantity });
    }
    if (giftActivityData.length > 50) giftActivityData.pop();
}

function addActivityFeedItem(type, text) {
    activityFeedData.unshift({
        type,
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    });
    if (activityFeedData.length > 50) activityFeedData.pop();
}

function updateHostAnalyticsUI() {
    if (!isHost) return;
    
    const currentValEl = document.getElementById('host-current-viewers');
    const peakValEl = document.getElementById('host-peak-viewers');
    const totalValEl = document.getElementById('host-total-joins');
    
    if (currentValEl) currentValEl.textContent = $('hud-viewers')?.textContent || '0';
    if (peakValEl) peakValEl.textContent = streamPeakViewers;
    if (totalValEl) totalValEl.textContent = streamTotalJoins;

    // Update Gift Activity list
    const giftListEl = document.getElementById('host-gift-activity');
    if (giftListEl) {
        if (giftActivityData.length === 0) {
            giftListEl.innerHTML = '<div class="empty-state-text">No gifts received yet</div>';
        } else {
            giftListEl.innerHTML = giftActivityData.map(g => `
                <div class="gift-activity-item glass-mini">
                    <span class="gift-sender">${escapeHTML(g.username)}</span>
                    <span class="gift-action">sent</span>
                    <span class="gift-details">${escapeHTML(g.giftName)}</span>
                    <span class="gift-qty">x${g.quantity}</span>
                </div>
            `).join('');
        }
    }

    // Update Activity Feed list
    const feedListEl = document.getElementById('host-activity-feed');
    if (feedListEl) {
        if (activityFeedData.length === 0) {
            feedListEl.innerHTML = '<div class="empty-state-text">Waiting for activity...</div>';
        } else {
            feedListEl.innerHTML = activityFeedData.map(act => {
                let icon = '🔔';
                if (act.type === 'join') icon = '👤';
                else if (act.type === 'follow') icon = '💖';
                else if (act.type === 'gift') icon = '🎁';
                else if (act.type === 'join-request') icon = '✋';
                
                return `
                    <div class="feed-activity-item glass-mini type-${act.type}">
                        <span class="activity-icon">${icon}</span>
                        <div class="activity-content">
                            <span class="activity-text">${escapeHTML(act.text)}</span>
                            <span class="activity-time">${act.timestamp}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
}


// ─── SEARCH ───────────────────────────────────────────────────────────
function initSearch() {
    const searchInput = $('global-search');
    const searchWrap = document.querySelector('.search-bar-wrap');
    const dropdown = $('search-dropdown');
    
    console.log('[Search] initSearch called', { searchInput, searchWrap, dropdown });

    searchInput.addEventListener('input', debounce(async (e) => {
        const query = e.target.value.trim();
        console.log('[Search] Input:', query);
        if (query.length >= 2) {
            dropdown.classList.remove('hidden');
            await searchUsers(query);
        } else {
            dropdown.classList.add('hidden');
            dropdown.innerHTML = '';
        }
    }, 300));

    const toggleSearch = () => {
        console.log('[Search] Toggling, current class:', searchWrap.classList.contains('active'));
        searchWrap.classList.toggle('active');
        if (searchWrap.classList.contains('active')) {
            searchInput.focus();
        } else {
            searchInput.value = '';
            dropdown.classList.add('hidden');
            dropdown.innerHTML = '';
        }
    };

    const triggerBtn = document.querySelector('.search-trigger');
    if (triggerBtn) {
        triggerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('[Search] Trigger clicked');
            toggleSearch();
        });
    }

    searchInput.addEventListener('click', (e) => e.stopPropagation());

    document.addEventListener('click', (e) => {
        if (searchWrap.classList.contains('active') && !searchWrap.contains(e.target)) {
            searchWrap.classList.remove('active');
            searchInput.value = '';
            dropdown.classList.add('hidden');
            dropdown.innerHTML = '';
        }
    });
}

async function searchUsers(query) {
    const dropdown = $('search-dropdown');
    
    // Show loading state
    dropdown.innerHTML = `
        <div class="search-loading">
            <div class="spinner"></div>
            <p>Searching...</p>
        </div>
    `;

    try {
        const users = await apiReq('GET', '/api/users/search?q=' + encodeURIComponent(query));
        
        if (!users || users.length === 0) {
            dropdown.innerHTML = `
                <div class="search-dropdown-header">Users</div>
                <div class="search-no-results">No users found for "${escapeHtml(query)}"</div>
            `;
            return;
        }

        // Build dropdown content
        let html = '<div class="search-dropdown-header">Users</div>';
        html += users.map(user => {
            const initials = (user.username || '?').charAt(0).toUpperCase();
            const avatarUrl = toAssetUrl(user.avatar);
            const avatarStyle = avatarUrl 
                ? `background-image: url(${avatarUrl});` 
                : '';
            const avatarContent = avatarUrl ? '' : initials;
            
            return `
                <div class="search-result-item" onclick="viewUserProfile(${user.id}, '${user.username}', '${user.avatar || ''}')">
                    <div class="search-result-avatar" style="${avatarStyle}">${avatarContent}</div>
                    <div class="search-result-info">
                        <div class="search-result-username">${escapeHtml(user.username)}</div>
                        <div class="search-result-meta">${user.bio ? escapeHtml(truncate(user.bio, 30)) : 'No bio'}</div>
                    </div>
                </div>
            `;
        }).join('');

        dropdown.innerHTML = html;
    } catch (error) {
        console.error('Search error:', error);
        dropdown.innerHTML = `
            <div class="search-no-results">Search failed. Please try again.</div>
        `;
    }
}

function truncate(str, maxLength) {
    if (!str) return '';
    return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function debounce(fn, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}

async function retryAsync(task, { retries = 2, delayMs = 500, shouldRetry } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            return await task(attempt);
        } catch (err) {
            lastError = err;
            const retryable = shouldRetry ? shouldRetry(err) : true;
            if (!retryable || attempt === retries) break;
            await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
        }
    }
    throw lastError;
}

// ─── NAV ──────────────────────────────────────────────────────────────
function navigateTo(screenName) {
    currentScreen = screenName;
    if (screenName === 'golive' && !currentUser) {
        showAuthOverlay('login');
        return;
    }
    if (screenName === 'wallet' && !currentUser) {
        showAuthOverlay('login');
        return;
    }

    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.classList.add('hidden');
    });

    const target = $(`screen-${screenName}`);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('active');
    }

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navItem = document.querySelector(`.nav-item[data-screen="${screenName}"]`);
    if (navItem) navItem.classList.add('active');

    // Side effects
    if (screenName === 'golive') {
        initCamera();
    } else {
        stopCamera();
    }

    if (screenName === 'wallet') loadWallet();
    if (screenName === 'profile') renderProfile();
    if (screenName === 'chat') renderChatList();
    if (screenName === 'home') loadStreams(document.querySelector('.cat-pill.active')?.dataset.cat || 'all');
    if (screenName === 'home') {
        if (homeRefreshTimer) clearInterval(homeRefreshTimer);
        homeRefreshTimer = setInterval(() => {
            if (currentScreen === 'home') {
                loadStreams(document.querySelector('.cat-pill.active')?.dataset.cat || 'all');
            }
        }, 10000);
    } else if (homeRefreshTimer) {
        clearInterval(homeRefreshTimer);
        homeRefreshTimer = null;
    }
    if (screenName !== 'chat-thread') chatPartnerId = null;
    if (screenName !== 'view-profile' && screenName !== 'follow-list') {
        viewProfileUserId = null;
    }
}

// ─── AUTH ──────────────────────────────────────────────────────────────
function showAuthOverlay(form = 'login') {
    $('auth-overlay').classList.remove('hidden');
    showAuthForm(form);
}
function hideAuthOverlay() {
    $('auth-overlay').classList.add('hidden');
    // Start 5-min guest timer
    if (!currentUser) startGuestTimer();
}
function showAuthForm(form) {
    $('login-form').classList.toggle('hidden', form !== 'login');
    $('register-form').classList.toggle('hidden', form !== 'register');
}

// ─── FIREBASE AUTH ────────────────────────────────────────────────────────
let fbAuth = null;
let pendingFirebaseToken = null;

function initFirebase(config) {
    if (!firebase.apps.length && config && config.apiKey) {
        firebase.initializeApp(config);
        fbAuth = firebase.auth();
    } else if (firebase.apps.length) {
        fbAuth = firebase.auth();
    }
}

async function signInWithGoogle() {
    if (!fbAuth) {
        try {
            const data = await apiReq('GET', '/api/config');
            if (data.firebaseConfig && data.firebaseConfig.apiKey) {
                initFirebase(data.firebaseConfig);
            } else {
                return showError('login-error', 'Firebase config missing. Please check your environment variables.');
            }
        } catch (e) {
            return showError('login-error', 'Failed to load configuration');
        }
    }
    
    if (!fbAuth) {
        return showError('login-error', 'Auth initialization failed. Please check your environment variables.');
    }

    const provider = new firebase.auth.GoogleAuthProvider();
    try {
        const result = await fbAuth.signInWithPopup(provider);
        const idToken = await result.user.getIdToken();
        
        const res = await fetch('/api/auth/google-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken })
        });
        const data = await res.json();
        
        if (res.status === 202 && data.requires_registration) {
            pendingFirebaseToken = idToken;
            showAuthForm('register');
        } else if (res.ok) {
            saveSession(data);
            hideAuthOverlay();
            afterLogin();
        } else {
            showError('login-error', data.message || 'Login failed');
        }
    } catch (err) {
        showError('login-error', err.message);
    }
}

function previewRegAvatar(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = e => {
            $('reg-avatar-preview').style.backgroundImage = `url(${e.target.result})`;
            $('reg-avatar-preview').style.backgroundSize = 'cover';
            $('reg-avatar-preview').style.backgroundPosition = 'center';
            $('reg-avatar-preview').textContent = '';
        };
        reader.readAsDataURL(file);
    }
}

async function completeGoogleRegistration() {
    const username = $('reg-username').value.trim();
    if (!username) return showError('reg-error', 'Username is required');
    if (!pendingFirebaseToken) return showError('reg-error', 'Session expired, try again');
    
    try {
        const res = await fetch('/api/auth/complete-registration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: pendingFirebaseToken, username })
        });
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.message || 'Registration failed');
        
        saveSession(data);
        
        // Upload avatar if selected
        const fileInput = $('reg-avatar-file');
        if (fileInput.files.length > 0) {
            const formData = new FormData();
            formData.append('avatar', fileInput.files[0]);
            try {
                const uploadRes = await fetch('/api/users/profile/avatar', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${data.token}` },
                    body: formData
                });
                const uploadData = await uploadRes.json();
                if (uploadRes.ok && uploadData.avatar) {
                    data.avatar = uploadData.avatar;
                    saveSession(data); // update session with avatar
                }
            } catch (err) {
                console.error('Avatar upload failed:', err);
            }
        }
        
        hideAuthOverlay();
        afterLogin();
    } catch (err) {
        showError('reg-error', err.message);
    }
}

function saveSession(user) {
    token = user.token;
    currentUser = user;
    localStorage.setItem('tl_token', token);
    localStorage.setItem('tl_user', JSON.stringify(user));
}

function afterLogin() {
    clearGuestTimer();
    $('guest-timer-popup').classList.add('hidden');

    // Explicitly disconnect old guest socket before creating a new authenticated one
    if (supabaseClient) {
        supabaseClient.removeAllChannels();
        socket = null;
    }

    initSocket();
    renderTopBar();
    navigateTo('home');
}

function logout() {
    token = null;
    currentUser = null;
    localStorage.removeItem('tl_token');
    localStorage.removeItem('tl_user');
    if (supabaseClient) {
        supabaseClient.removeAllChannels();
        socket = null;
    }
    renderTopBar();
    navigateTo('home');
    showAuthOverlay('login');
}

function showError(id, msg) {
    const el = $(id);
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 4000);
}

// ─── GUEST TIMER ──────────────────────────────────────────────────────
let guestSecondsLeft = 5 * 60;
function startGuestTimer() {
    if (currentUser) return;
    clearGuestTimer(); // Ensure only one timer is running at a time
    guestSecondsLeft = 5 * 60;
    const popup = $('guest-timer-popup');
    popup.classList.remove('hidden');

    guestTimerInterval = setInterval(() => {
        guestSecondsLeft--;
        const m = Math.floor(guestSecondsLeft / 60);
        const s = guestSecondsLeft % 60;
        $('guest-timer-count').textContent = `${m}:${s.toString().padStart(2, '0')}`;
        if (guestSecondsLeft <= 0) {
            clearGuestTimer();
            popup.classList.add('hidden');
            leaveLiveScreen();
            showAuthOverlay('register');
        }
    }, 1000);
}
function clearGuestTimer() {
    if (guestTimerInterval) { clearInterval(guestTimerInterval); guestTimerInterval = null; }
}

// ─── TOP BAR ──────────────────────────────────────────────────────────
function renderTopBar() {
    const avatarEl = $('user-avatar-top');
    if (currentUser) {
        setAvatar(avatarEl, currentUser.avatar, currentUser.username);
    } else {
        setAvatar(avatarEl, null, null);
    }
}

// ─── HOME FEED ────────────────────────────────────────────────────────
async function loadStreams(cat) {
    const feed = $('stream-feed');
    feed.innerHTML = '<div class="feed-loading"><div class="spinner"></div><p>Loading streams...</p></div>';
    try {
        let endpoint = currentUser ? '/api/streams/all' : '/api/streams';
        if (cat === 'following') endpoint += '?category=following';

        const streams = await apiReq('GET', endpoint);
        renderStreamFeed(streams, cat);
    } catch {
        feed.innerHTML = '<div class="feed-loading"><p>Could not load streams.</p></div>';
    }
}

const STREAM_EMOJIS = { Gaming: '🎮', Music: '🎵', Talk: '💬', Dance: '💃', Cooking: '🍳', General: '🌐' };
function renderStreamFeed(streams, cat) {
    const feed = $('stream-feed');
    let filtered = streams;
    if (cat && cat !== 'all' && cat !== 'following') {
        filtered = streams.filter(s => s.category?.toLowerCase() === cat.toLowerCase());
    }
    if (!filtered.length) {
        if (cat === 'following') {
            feed.innerHTML = '<div class="feed-loading"><span style="font-size:2.5rem">🤝</span><p>No one you follow is live. Explore some new hosts!</p></div>';
            return;
        }

        filtered = [
            { id: "'mock1'", username: 'GamingGuru', category: 'Gaming', viewer_count: 1240, type: 'public', title: 'Late Night Valorant Ranked!' },
            { id: "'mock2'", username: 'MelodyMaker', category: 'Music', viewer_count: 850, type: 'public', title: 'Acoustic Covers & Chill' },
            { id: "'mock3'", username: 'ChefGordon', category: 'Cooking', viewer_count: 3200, type: 'public', title: 'Making the perfect Carbonara' },
            { id: "'mock4'", username: 'DanceQueen', category: 'Dance', viewer_count: 540, type: 'public', title: 'Learning new K-Pop Choreo' }
        ];
        if (cat && cat !== 'all') {
            filtered = filtered.filter(s => s.category?.toLowerCase() === cat.toLowerCase());
        }
    }
    feed.innerHTML = renderStreamFeedHTML(filtered);
}

function captureThumbnail() {
    const video = document.getElementById('local-video');
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
}

function renderStreamFeedHTML(streams) {
    return streams.map((s, i) => {
        const initials = s.username ? s.username.charAt(0).toUpperCase() : '?';
        const thumbUrl = toAssetUrl(s.thumbnail);
        const avatarUrl = toAssetUrl(s.avatar);
        const thumbBg = thumbUrl ? `background-image:url(${thumbUrl});background-size:cover;background-position:center;` : '';

        return `
    <div class="stream-card" style="animation-delay:${i * 0.07}s" onclick="openStream(${s.id})">
      <div class="stream-thumb" style="${thumbBg}">
        ${!s.thumbnail ? `<span class="stream-thumb-emoji">${STREAM_EMOJIS[s.category] || '🌐'}</span>` : ''}
        <div class="stream-thumb-overlay"></div>
        <span style="position:absolute;top:8px;left:8px;z-index:2">
          <span class="live-badge">LIVE</span>
          ${s.is_trending ? '<span class="trending-badge">🔥 TRENDING</span>' : ''}
        </span>
        ${s.type && s.type.toLowerCase() !== 'public' ? `
          <div style="position:absolute;top:8px;right:8px;z-index:3;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);padding:4px 6px;border-radius:8px;border:1px solid var(--glass-border);display:flex;align-items:center;justify-content:center;color:white;">
            <span style="display:flex;align-items:center;color:white;width:12px;height:12px">${s.type.toLowerCase() === 'private' ? '<svg viewBox="0 0 24 24" style="width:100%;height:100%;stroke:currentColor;fill:none;stroke-width:2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' : '<svg viewBox="0 0 24 24" style="width:100%;height:100%;stroke:currentColor;fill:none;stroke-width:2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'}</span>
          </div>` : ''}
      </div>
      <div class="stream-card-info">
        <div style="display:flex; align-items:center; gap:8px">
           <div class="thumb-avatar" style="width:20px;height:20px;font-size:0.6rem;background:var(--accent);display:flex;align-items:center;justify-content:center;color:white;border-radius:50%;background-size:cover;background-position:center;${avatarUrl ? `background-image:url(${avatarUrl})` : ''}">${avatarUrl ? '' : initials}</div>
           <div class="stream-card-host">${s.username}</div>
        </div>
        <div class="stream-card-meta">
          <span class="viewer-count">
            <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            <span>${s.viewer_count || 0}</span>
          </span>
        </div>
        <div class="stream-card-cat">${s.category || 'General'}</div>
      </div>
    </div>
  `;
    }).join('');
}

document.querySelectorAll('.cat-pill').forEach(pill => {
    pill.addEventListener('click', () => {
        document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        loadStreams(pill.dataset.cat);
    });
});

// ─── OPEN STREAM ──────────────────────────────────────────────────────
async function openStream(streamId) {
    if (typeof streamId === 'string' && streamId.startsWith('mock')) {
        alert("This is just a sample placeholder stream to show what the UI looks like!");
        return;
    }
    try {
        const stream = await apiReq('GET', `/api/streams/${streamId}`);
        currentStream = stream;
        isHost = currentUser && currentUser.id === stream.host_id;

        // For private/group: show join request flow
        if ((stream.type === 'private' || stream.type === 'group') && !isHost) {
            if (!currentUser) { showAuthOverlay('login'); return; }
            showJoinRequestModal(stream);
            return;
        }

        await enterLiveScreen(stream);

        // Start guest timer if not logged in
        if (!currentUser) startGuestTimer();
    } catch (err) {
        alert('Failed to open stream: ' + err.message);
    }
}

async function enterLiveScreen(stream, existingToken = null) {
    currentScreen = 'live';
    currentStream = stream;
    isHost = currentUser && currentUser.id === stream.host_id;

    // Reset Host Analytics
    streamPeakViewers = 0;
    streamTotalJoins = 0;
    giftActivityData = [];
    activityFeedData = [];

    if (!shouldPublishLocalTracks()) {
        stopCamera(); // viewers do not need local preview stream
    }

    // NEW: Reset co-streaming states for the new session
    activeGuestIds.clear();
    isGuestStreamer = false;
    $('video-area').innerHTML = ''; // Clear all old video wrappers
    $('video-area').className = 'video-area grid-1'; // Reset grid

    // Update HUD
    const hudTitle = $('hud-title');
    if (hudTitle) hudTitle.textContent = stream.title || 'Live Stream';
    const hudViewers = $('hud-viewers');
    if (hudViewers) hudViewers.textContent = stream.viewer_count || 0;
    const hudHostName = $('hud-host-name');
    if (hudHostName) hudHostName.textContent = stream.username || 'Host';

    const hudHostAvatar = $('hud-host-avatar');
    if (hudHostAvatar) setAvatar(hudHostAvatar, stream.avatar, stream.username || 'H');

    // Show/hide end stream button & host controls
    const endBtn = $('end-stream-btn');
    if (endBtn) endBtn.classList.toggle('hidden', !isHost);

    const hostCtrls = $('host-controls');
    if (hostCtrls) hostCtrls.classList.toggle('hidden', !isHost);

    const viewerCtrls = $('viewer-controls');
    if (viewerCtrls) viewerCtrls.classList.toggle('hidden', isHost);

    // Initial state for host/viewer toggles
    if (isHost) {
        const micBtn = $('hud-mic-btn');
        const camBtn = $('hud-cam-btn');
        if (micBtn) {
            micBtn.classList.remove('muted');
            micBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`;
        }
        if (camBtn) {
            camBtn.classList.remove('muted');
            camBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`;
        }
        const vPlaceholder = $('video-placeholder');
        if (vPlaceholder) vPlaceholder.classList.add('hidden');
    }

    // Clear chat
    if (isHost) {
        const chatBox = $('chat-messages');
        if (chatBox) chatBox.innerHTML = '';
    } else {
        const chatBox = $('chat-messages');
        if (chatBox) {
            chatBox.innerHTML = `
                <div class="chat-empty-state">
                  <span class="chat-empty-icon">💬</span>
                  <p>Welcome to the stream! Say hello to the host.</p>
                </div>
            `;
        }
    }

    // Switch screen
    document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.classList.add('hidden'); });
    $('screen-live').classList.remove('hidden');
    $('screen-live').classList.add('active');

    // Toggle Host vs Viewer layout structures
    if (isHost) {
        document.getElementById('host-live-screen').classList.remove('hidden');
        document.getElementById('viewer-live-screen').classList.add('hidden');
        updateHostAnalyticsUI();
        await updateDevicesList(); // Populate device select menus
    } else {
        document.getElementById('viewer-live-screen').classList.remove('hidden');
        document.getElementById('host-live-screen').classList.add('hidden');
    }

    // Join socket room
    await initSocket();
    await joinRoom(stream.livekit_room);

    // Create host's own local video wrapper in the grid
    if (isHost) {
        const videoArea = $('video-area');
        const localWrapper = document.createElement('div');
        localWrapper.id = `video-wrapper-${currentUser.username}`;
        localWrapper.className = 'video-wrapper';
        const localVid = document.createElement('video');
        localVid.id = 'local-video';
        localVid.className = 'live-video';
        localVid.autoplay = true;
        localVid.muted = true;
        localVid.playsInline = true;
        const badge = document.createElement('div');
        badge.className = 'guest-name-badge';
        badge.textContent = (currentUser?.username || 'You') + ' (Host)';
        localWrapper.appendChild(localVid);
        localWrapper.appendChild(badge);
        videoArea.insertBefore(localWrapper, videoArea.firstChild);
        
        // Show immediate preview while LiveKit connection initializes
        if (mediaStream) {
            console.log('[Live] Attaching mediaStream to local video preview');
            localVid.srcObject = mediaStream;
            localVid.classList.remove('hidden');
            localVid.play().catch((err) => {
                console.warn('[Live] Local video play() failed:', err);
            });
            updateLiveMirror(); // Apply mirror status immediately
        } else {
            console.warn('[Live] mediaStream not available for preview');
        }
        
        // Note: We don't add '__local__' to activeGuestIds anymore. 
        // updateVideoGrid() handles the local user separately.
        updateVideoGrid();
    }

    // Fetch LiveKit token and connect (unless token is already provided)
    try {
        const livekitToken = existingToken || (await retryAsync(async () => {
            const tk = await apiReq('POST', '/api/livekit/token', {
                room: stream.livekit_room,
                identity: currentUser ? currentUser.username : null,
                canPublish: shouldPublishLocalTracks()
            });
            if (!tk?.token) throw new Error('LiveKit token was empty');
            return tk;
        }, {
            retries: 2,
            delayMs: 700,
            shouldRetry: (err) => !String(err?.message || '').includes('Not authorized'),
        })).token;

        await retryAsync(
            async () => connectToLiveKit(livekitToken, stream.livekit_room),
            {
                retries: 1,
                delayMs: 800,
                shouldRetry: (err) => {
                    const msg = String(err?.message || '');
                    return !msg.includes('Client initiated disconnect');
                },
            }
        );
    } catch (err) {
        console.error('Failed to initialize LiveKit:', err);
        const overlay = $('connection-overlay');
        if (overlay) {
            overlay.classList.remove('hidden');
            overlay.innerHTML = `<p class="error-msg">Failed to connect: ${err.message}</p>`;
        }
        if (!currentUser) {
            appendChat('System', 'You are watching as a guest. Log in to chat and send gifts!', true);
        }
    }

    // Load gifts for viewer
    if (!isHost) {
        console.log('[Live] Viewer mode detected, loading gifts');
        // Reset ALL gift selection state for new stream
        selectedViewerGift = null;
        selectedGiftId = null;
        selectedGift = null;
        selectedGiftCost = null;
        selectedGiftIcon = null;
        isViewerGiftSending = false;
        clearViewerGiftError();
        await loadViewerGifts();
    } else {
        console.log('[Live] Host mode detected, skipping viewer gift loading');
        loadGifts();
    }

    // Check follow status
    updateFollowButton();
}


// ─── FOLLOW SYSTEM ────────────────────────────────────────────────────
async function toggleFollow() {
    if (!currentUser) { showAuthOverlay('login'); return; }
    if (!currentStream || isHost) return;

    const followBtn = $('hud-follow-btn');
    const isFollowing = followBtn.classList.contains('following');
    const method = isFollowing ? 'DELETE' : 'POST';

    try {
        await apiReq(method, `/api/users/follow/${currentStream.host_id}`);
        updateFollowButton();
    } catch (err) {
        console.error("Follow error:", err);
    }
}

async function updateFollowButton() {
    const btn = $('hud-follow-btn');
    if (!btn) return;

    if (!currentUser || !currentStream || isHost) {
        btn.classList.add('hidden');
        return;
    }

    try {
        const { isFollowing } = await apiReq('GET', `/api/users/follow-status/${currentStream.host_id}`);
        btn.classList.remove('hidden');
        btn.classList.toggle('following', isFollowing);
        btn.textContent = isFollowing ? 'Following' : '+ Follow';
    } catch (e) {
        btn.classList.add('hidden');
    }
}


// End of previous block

// ─── LIVEKIT INTEGRATION ──────────────────────────────────────────────
function shouldPublishLocalTracks() {
    return isHost || isGuestStreamer;
}

function markManualLivekitDisconnect() {
    lastManualLivekitDisconnectAt = Date.now();
}

function clearAudioElements() {
    document.querySelectorAll('audio[id^="audio-track-"]').forEach((el) => el.remove());
}

function normalizeLivekitUrl(rawUrl) {
    const url = (rawUrl || '').trim();
    if (!url) throw new Error('LiveKit URL is missing');
    if (!url.startsWith('wss://')) {
        throw new Error('Invalid LiveKit URL. Expected a secure wss:// URL');
    }
    return url;
}

async function getLivekitUrl() {
    if (cachedLivekitUrl) return normalizeLivekitUrl(cachedLivekitUrl);
    const config = await apiReq('GET', '/api/config');
    cachedLivekitUrl = normalizeLivekitUrl(config.livekitUrl);
    return cachedLivekitUrl;
}

async function attachLocalVideo(track) {
    const localVideo = $('local-video');
    if (!localVideo) {
        console.warn('[Video] local-video element not found');
        return;
    }
    if (!track) {
        console.warn('[Video] No track provided to attachLocalVideo');
        return;
    }
    
    try {
        console.log('[Video] Attaching local video track');
        track.detach(localVideo);
        track.attach(localVideo);
        localVideo.classList.remove('hidden');
        
        // Ensure video plays
        if (localVideo.paused) {
            await localVideo.play();
        }
        console.log('[Video] Local video attached and playing');
    } catch (e) {
        console.error('[Video] Error attaching local video:', e);
    }
}

async function syncHostControlButtons() {
    if (!shouldPublishLocalTracks() || !livekitRoom?.localParticipant) {
        console.warn('[Controls] Cannot sync buttons - not publishing or no local participant');
        return;
    }
    
    const micBtn = $('hud-mic-btn');
    const camBtn = $('hud-cam-btn');
    
    const audioPub = Array.from(livekitRoom.localParticipant.audioTrackPublications.values())[0];
    const micEnabledFromPub = audioPub ? !audioPub.isMuted : null;
    const micEnabledFromLocalTrack = mediaStream?.getAudioTracks?.()[0]?.enabled;
    const micEnabled = micEnabledFromPub !== null
        ? micEnabledFromPub
        : (typeof micEnabledFromLocalTrack === 'boolean'
            ? micEnabledFromLocalTrack
            : !!livekitRoom.localParticipant.isMicrophoneEnabled);
    
    const camEnabled = livekitRoom.localParticipant.isCameraEnabled;
    
    console.log('[Controls] Syncing buttons - Mic:', micEnabled, 'Camera:', camEnabled);
    
    if (micBtn) {
        micBtn.classList.toggle('muted', !micEnabled);
        micBtn.innerHTML = micEnabled
            ? `<svg viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`
            : `<svg viewBox="0 0 24 24"><line x1="2" y1="2" x2="22" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 11v-1"/><path d="M9 9h.01"/><path d="M9.01 3.8a3 3 0 0 1 5.99.2v4.3"/><path d="M5.61 5.61A7 7 0 0 0 5 11v1a7 7 0 0 0 7 7M12 19v3"/></svg>`;
    }
    if (camBtn) {
        camBtn.classList.toggle('muted', !camEnabled);
        camBtn.innerHTML = camEnabled
            ? `<svg viewBox="0 0 24 24"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`
            : `<svg viewBox="0 0 24 24"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
    }
}

async function ensureLocalMediaPublished() {
    try {
        // Ensure camera is initialized before publishing
        if (!mediaStream) {
            console.log('[LiveKit] mediaStream not initialized, initializing camera...');
            await initCamera();
        }

        // Enable microphone and camera based on pre-live screen configurations
        await livekitRoom.localParticipant.setCameraEnabled(isCameraOn, isCameraOn && selectedCameraId ? { deviceId: selectedCameraId } : undefined);
        await livekitRoom.localParticipant.setMicrophoneEnabled(isMicOn, isMicOn && selectedMicId ? { deviceId: selectedMicId } : undefined);

        // Get the video track publication
        const videoPub = Array.from(livekitRoom.localParticipant.videoTrackPublications.values())[0];
        if (videoPub?.track) {
            console.log('[LiveKit] Attaching local video track');
            await attachLocalVideo(videoPub.track);
        } else {
            console.warn('[LiveKit] No video track publication found');
        }

        await syncHostControlButtons();
    } catch (error) {
        console.error('[LiveKit] Error ensuring local media published:', error);
        throw error;
    }
}

async function connectToLiveKit(token, roomName) {
    const connectSeq = ++livekitConnectSeq;
    if (livekitRoom) {
        try {
            markManualLivekitDisconnect();
            await livekitRoom.disconnect();
        } catch (disconnectErr) {
            console.warn('Previous LiveKit disconnect warning:', disconnectErr);
        }
    }
    clearAudioElements();

    const preferMobilePreset = isMobileDevice();
    const publishPreset = preferMobilePreset
        ? (LivekitClient.VideoPresets?.h540 || LivekitClient.VideoPresets?.h720)
        : (LivekitClient.VideoPresets?.h1080 || LivekitClient.VideoPresets?.h720);
    const preferredCodec = preferMobilePreset ? 'vp8' : 'h264';
    livekitRoom = new LivekitClient.Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: {
            resolution: publishPreset.resolution,
        },
        publishDefaults: {
            simulcast: !preferMobilePreset,
            videoEncoding: publishPreset.encoding,
            screenShareEncoding: publishPreset.encoding,
            videoCodec: preferredCodec,
        }
    });

    // Setup event listeners
    livekitRoom
        .on(LivekitClient.RoomEvent.TrackSubscribed, handleTrackSubscribed)
        .on(LivekitClient.RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed)
        .on(LivekitClient.RoomEvent.AudioPlaybackStatusChanged, handleAudioPlaybackStatus)
        .on(LivekitClient.RoomEvent.TrackMuted, (pub, part) => handleTrackMuteChange(pub, part, true))
        .on(LivekitClient.RoomEvent.TrackUnmuted, (pub, part) => handleTrackMuteChange(pub, part, false))
        .on(LivekitClient.RoomEvent.ParticipantDisconnected, (participant) => {
            removeGuestVideo(participant.identity);
        })
        .on(LivekitClient.RoomEvent.Disconnected, () => {
            const isManual = Date.now() - lastManualLivekitDisconnectAt < 4000;
            if (isManual) {
                console.log('[LiveKit] Disconnected (manual/reconnect)');
            } else {
                console.warn('[LiveKit] Disconnected unexpectedly');
            }
            clearAudioElements();
        });

    // Show connection overlay at start of connect attempt
    const connOverlay = $('connection-overlay');
    if (connOverlay) {
        connOverlay.classList.remove('hidden');
        connOverlay.innerHTML = '<div class="spinner"></div><p>Connecting to stream...</p>';
    }

    try {
        const livekitUrl = await getLivekitUrl();

        await livekitRoom.connect(livekitUrl, token);
        if (connectSeq !== livekitConnectSeq) {
            await livekitRoom.disconnect();
            return;
        }
        console.log('[LiveKit] Connected to room:', roomName);

        if (shouldPublishLocalTracks()) {
            await ensureLocalMediaPublished();
            console.log('[LiveKit] Local media enabled and published');
        }

        if (!shouldPublishLocalTracks() && !livekitRoom.canPlaybackAudio) {
            console.warn('Audio blocked immediately on connect. Showing prompt.');
            showAudioPrompt();
        }

        if (!shouldPublishLocalTracks()) {
            await livekitRoom.startAudio().catch((e) => {
                console.warn('Early startAudio failed:', e);
            });
            livekitRoom.remoteParticipants.forEach((participant) => {
                participant.trackPublications.forEach((publication) => {
                    if (publication.track) {
                        handleTrackSubscribed(publication.track, publication, participant);
                    }
                });
            });
        }
        if (connOverlay) connOverlay.classList.add('hidden');
    } catch (error) {
        const errorMsg = String(error?.message || '');
        const isExpectedDisconnect =
            connectSeq !== livekitConnectSeq ||
            errorMsg.includes('Client initiated disconnect') ||
            errorMsg.includes('user initiated disconnect');
        if (isExpectedDisconnect) {
            console.warn('[LiveKit] Connect attempt cancelled by a newer request.');
            return;
        }
        console.error('[LiveKit] Failed to connect:', error);
        const overlay = $('connection-overlay');
        if (overlay) {
            overlay.classList.remove('hidden');
            overlay.innerHTML = `
                <p class="error-msg" style="background:none;">Video connection failed. Please check LiveKit configuration.</p>
                <button class="btn-primary btn-sm" onclick="location.reload()">Retry Connection</button>
            `;
        }
    }
}

function handleTrackSubscribed(track, publication, participant) {
    // This handler is ONLY for the main livestream room.
    // The private call room registers its own dedicated inline handler in connectToPrivateCallLiveKit().
    console.log('[Stream] Track subscribed:', track.kind, participant.identity);

    if (track.kind === 'video') {
        renderParticipantVideo(participant, track);
        if (publication.isMuted) {
            handleTrackMuteChange(publication, participant, true);
        }
    } else if (track.kind === 'audio') {
        const audioId = `audio-track-${participant.identity}`;
        let existing = $(audioId);
        if (existing) {
            existing.pause();
            existing.remove();
        }

        const el = track.attach();
        el.id = audioId;
        el.muted = false;
        el.autoplay = true;
        el.playsInline = true;
        document.body.appendChild(el);
        el.play().catch(e => {
            console.warn('Initial audio play() failed:', e);
            showAudioPrompt();
        });
        console.log('Audio track attached for:', participant.identity);
    }
}

function renderParticipantVideo(participant, track) {
    // Failsafe: Hide connection overlay whenever a video is rendered
    const connOverlay = $('connection-overlay');
    if (connOverlay) connOverlay.classList.add('hidden');

    const videoArea = $('video-area');
    const wrapperId = `video-wrapper-${participant.identity}`;
    let wrapper = $(wrapperId);

    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.id = wrapperId;
        wrapper.className = 'video-wrapper';

        const videoEl = document.createElement('video');
        videoEl.id = `video-${participant.identity}`;
        videoEl.className = 'live-video';
        videoEl.autoplay = true;
        videoEl.playsInline = true;

        const badge = document.createElement('div');
        badge.className = 'guest-name-badge';
        badge.textContent = participant.identity || 'Guest';

        wrapper.appendChild(videoEl);
        wrapper.appendChild(badge);

        // If I am host, add a Kick button for guests (but not for myself)
        if (isHost && !participant.isLocal) {
            const kickBtn = document.createElement('button');
            kickBtn.className = 'kick-btn-overlay';
            kickBtn.innerHTML = '✕';
            kickBtn.onclick = (e) => { e.stopPropagation(); kickGuest(participant.identity); };
            wrapper.appendChild(kickBtn);
        }

        videoArea.appendChild(wrapper);
        activeGuestIds.add(participant.identity);
        updateVideoGrid();
    }

    const video = wrapper.querySelector('video');
    track.detach(video);
    track.attach(video);
    video.play().catch(e => console.warn('Autoplay prevented video:', e));
}

function handleTrackUnsubscribed(track, publication, participant) {
    track.detach();
    if (track.kind === 'video') {
        removeGuestVideo(participant.identity);
    } else if (track.kind === 'audio') {
        const audioEl = $(`audio-track-${participant.identity}`);
        if (audioEl) {
            audioEl.pause();
            audioEl.remove();
        }
    }
}

function removeGuestVideo(identity) {
    const wrapper = $(`video-wrapper-${identity}`);
    if (wrapper) {
        wrapper.remove();
        activeGuestIds.delete(identity);
        updateVideoGrid();
    }
}

function updateVideoGrid() {
    const area = $('video-area');
    if (!area) return;

    const count = activeGuestIds.size + (isHost || isGuestStreamer ? 1 : 0); // Participants + Local 

    // Clear old grid classes
    area.classList.remove('grid-1', 'grid-2', 'grid-3', 'grid-4');

    if (count <= 1) area.classList.add('grid-1');
    else if (count === 2) area.classList.add('grid-2');
    else if (count === 3) area.classList.add('grid-3');
    else area.classList.add('grid-4');
}

function handleAudioPlaybackStatus() {
    if (!livekitRoom) return;
    console.log('Audio playback status changed. Can playback:', livekitRoom.canPlaybackAudio);
    if (livekitRoom.canPlaybackAudio) {
        hideAudioPrompt();
    } else {
        showAudioPrompt();
    }
}

function showAudioPrompt() {
    let prompt = $('audio-prompt');
    if (!prompt) prompt = createAudioPrompt();
    prompt.classList.remove('hidden');
    // For some browsers, adding interaction hint helps
    console.warn('Audio is blocked by browser. Showing unmute prompt.');
}

function hideAudioPrompt() {
    const prompt = $('audio-prompt');
    if (prompt) prompt.classList.add('hidden');
}

function createAudioPrompt() {
    const div = document.createElement('div');
    div.id = 'audio-prompt';
    div.className = 'audio-unlock-overlay hidden';
    div.innerHTML = `
        <div class="audio-prompt-content glass">
            <div class="prompt-icon-ring">
                <span class="prompt-icon-large">🔇</span>
            </div>
            <h3>Audio is Muted</h3>
            <p>Your browser is blocking sound.</p>
            <button class="btn-primary" onclick="resumeAudio()">
                Tap to Unmute
            </button>
        </div>
    `;
    // Append to body to ensure it's not hidden by container overflow
    document.body.appendChild(div);
    return div;
}

async function resumeAudio() {
    if (livekitRoom) {
        try {
            await livekitRoom.startAudio();
            console.log('Audio manually resumed by user');
            hideAudioPrompt();
        } catch (err) {
            console.error('Failed to resume audio:', err);
        }
    }
}


function leaveLiveScreen() {
    if (socket && currentStream) {
        // roomChannel.unsubscribe() is handled in joinRoom
    }
    if (livekitRoom) {
        markManualLivekitDisconnect();
        livekitRoom.disconnect();
        livekitRoom = null;
    }
    clearAudioElements();
    closeGiftPanel();
    currentStream = null;

    isHost = false;
    isGuestStreamer = false;
    activeGuestIds.clear();
    
    // Clean up both possible video areas
    const hostVideoArea = document.getElementById('host-video-area');
    if (hostVideoArea) hostVideoArea.innerHTML = '';
    const viewerVideoArea = document.getElementById('viewer-video-area');
    if (viewerVideoArea) viewerVideoArea.innerHTML = '';

    const hostLiveScreen = document.getElementById('host-live-screen');
    if (hostLiveScreen) hostLiveScreen.classList.add('hidden');
    const viewerLiveScreen = document.getElementById('viewer-live-screen');
    if (viewerLiveScreen) viewerLiveScreen.classList.add('hidden');

    clearGuestTimer();
    $('guest-timer-popup').classList.add('hidden');
    stopCamera();
    navigateTo('home');
}

// ─── LIVE STREAM CONTROLS ─────────────────────────────────────────────
function toggleLiveMirror() {
    isCameraMirrored = !isCameraMirrored;
    localStorage.setItem('prelive_camera_mirrored', isCameraMirrored);
    console.log('[Live Controls] Toggle mirror. New state:', isCameraMirrored);
    updateLiveMirror();
    
    const mirrorBtn = document.getElementById('host-mirror-btn');
    if (mirrorBtn) {
        mirrorBtn.classList.toggle('active', isCameraMirrored);
    }
}

function updateLiveMirror() {
    const localVideo = document.getElementById('local-video');
    if (localVideo) {
        if (isCameraMirrored) {
            localVideo.style.transform = 'scaleX(-1)';
        } else {
            localVideo.style.transform = 'none';
        }
    }
}

async function changeLiveCameraDevice(deviceId) {
    console.log('[Live Controls] Changing camera device to:', deviceId);
    selectedCameraId = deviceId;
    localStorage.setItem('prelive_camera_id', deviceId);
    
    if (livekitRoom?.localParticipant) {
        try {
            const enabled = !!livekitRoom.localParticipant.isCameraEnabled;
            if (enabled) {
                await livekitRoom.localParticipant.setCameraEnabled(true, { deviceId });
            }
        } catch (e) {
            console.error('Failed to change LiveKit camera device:', e);
        }
    }
    
    if (isCameraOn) {
        await initCamera();
    }
}

async function changeLiveMicDevice(deviceId) {
    console.log('[Live Controls] Changing mic device to:', deviceId);
    selectedMicId = deviceId;
    localStorage.setItem('prelive_mic_id', deviceId);
    
    if (livekitRoom?.localParticipant) {
        try {
            const audioPub = Array.from(livekitRoom.localParticipant.audioTrackPublications.values())[0];
            const enabled = audioPub ? !audioPub.isMuted : !!livekitRoom.localParticipant.isMicrophoneEnabled;
            if (enabled) {
                await livekitRoom.localParticipant.setMicrophoneEnabled(true, { deviceId });
            }
        } catch (e) {
            console.error('Failed to change LiveKit mic device:', e);
        }
    }
    
    if (isMicOn) {
        await initCamera();
    }
}

// ─── GO LIVE ──────────────────────────────────────────────────────────
let mediaStream = null;
let selectedCameraId = localStorage.getItem('prelive_camera_id') || '';
let selectedMicId = localStorage.getItem('prelive_mic_id') || '';
let isCameraOn = true;
let isMicOn = true;
let isCameraMirrored = localStorage.getItem('prelive_camera_mirrored') === 'true';

function getCameraIconSvg() {
    return `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-video"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>`;
}
function getCameraOffIconSvg() {
    return `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-video-off"><path d="M10.66 6H14a2 2 0 0 1 2 2v3.34"/><path d="m22 8-6 4 6 4v-8Z"/><path d="M3.56 3.56 20.44 20.44"/><path d="M2 8.12V16a2 2 0 0 0 2 2h9.88"/></svg>`;
}
function getMicIconSvg() {
    return `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-mic"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`;
}
function getMicOffIconSvg() {
    return `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-mic-off"><line x1="2" y1="2" x2="22" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 11v-1"/><path d="m9 9-.01 3a3 3 0 0 0 5.93 0"/><path d="M9.009 3.805a3 3 0 0 1 5.991.195v3.195"/><path d="M9 20h6"/><line x1="12" x2="12" y1="16" y2="20"/><path d="M5.61 5.61A7 7 0 0 0 5 11v1"/></svg>`;
}

async function updateDevicesList() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoSelect = $('camera-device-select');
        const audioSelect = $('mic-device-select');

        if (!videoSelect || !audioSelect) return;

        const prevVideoId = selectedCameraId || videoSelect.value;
        const prevAudioId = selectedMicId || audioSelect.value;

        videoSelect.innerHTML = '';
        audioSelect.innerHTML = '';

        let videoCount = 0;
        let audioCount = 0;

        devices.forEach(device => {
            if (device.kind === 'videoinput') {
                videoCount++;
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Webcam ${videoCount}`;
                videoSelect.appendChild(option);
            } else if (device.kind === 'audioinput') {
                audioCount++;
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Microphone ${audioCount}`;
                audioSelect.appendChild(option);
            }
        });

        if (videoCount === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No Camera Available';
            videoSelect.appendChild(option);
        }
        if (audioCount === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No Mic Available';
            audioSelect.appendChild(option);
        }

        if (Array.from(videoSelect.options).some(opt => opt.value === prevVideoId)) {
            videoSelect.value = prevVideoId;
            selectedCameraId = prevVideoId;
        } else if (videoSelect.options.length > 0) {
            selectedCameraId = videoSelect.value;
        }

        if (Array.from(audioSelect.options).some(opt => opt.value === prevAudioId)) {
            audioSelect.value = prevAudioId;
            selectedMicId = prevAudioId;
        } else if (audioSelect.options.length > 0) {
            selectedMicId = audioSelect.value;
        }
    } catch (err) {
        console.error('[Devices] Failed to enumerate devices:', err);
    }
}

async function initCamera() {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Camera API is not available. Please ensure HTTPS or localhost.');
        }

        const loader = $('camera-loader');
        if (loader) loader.classList.remove('hidden');

        const preview = $('camera-preview');
        const placeholder = $('camera-placeholder');

        if (mediaStream) {
            mediaStream.getTracks().forEach(t => t.stop());
            mediaStream = null;
        }
        if (preview) {
            preview.srcObject = null;
        }

        updateMirrorPreview();

        const camBtn = $('golive-btn-cam');
        if (camBtn) {
            camBtn.classList.toggle('active', isCameraOn);
            camBtn.innerHTML = isCameraOn ? getCameraIconSvg() : getCameraOffIconSvg();
        }
        const micBtn = $('golive-btn-mic');
        if (micBtn) {
            micBtn.classList.toggle('active', isMicOn);
            micBtn.innerHTML = isMicOn ? getMicIconSvg() : getMicOffIconSvg();
        }
        const mirrorBtn = $('golive-btn-mirror');
        if (mirrorBtn) {
            mirrorBtn.classList.toggle('active', isCameraMirrored);
        }

        if (!isCameraOn && !isMicOn) {
            if (preview) preview.classList.add('hidden');
            if (placeholder) placeholder.classList.remove('hidden');
            if (loader) loader.classList.add('hidden');
            console.log('[Camera] Both camera and microphone are disabled.');
            await updateDevicesList();
            return;
        }

        const videoConstraints = isCameraOn ? {
            deviceId: selectedCameraId ? { exact: selectedCameraId } : undefined,
            width: { ideal: 1080 },
            height: { ideal: 1920 },
            aspectRatio: { ideal: 9/16 }
        } : false;

        const audioConstraints = isMicOn ? {
            deviceId: selectedMicId ? { exact: selectedMicId } : undefined
        } : false;

        let stream = null;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: videoConstraints,
                audio: audioConstraints
            });
        } catch (err) {
            console.warn('[Camera] Failed with ideal constraints, trying generic constraints', err);
            stream = await navigator.mediaDevices.getUserMedia({
                video: isCameraOn ? (selectedCameraId ? { deviceId: selectedCameraId } : true) : false,
                audio: isMicOn ? (selectedMicId ? { deviceId: selectedMicId } : true) : false
            });
        }

        mediaStream = stream;

        if (isCameraOn) {
            if (preview) {
                preview.srcObject = mediaStream;
                preview.classList.remove('hidden');
                preview.play().catch(e => console.warn('[Camera] Autoplay prevented preview play:', e));
            }
            if (placeholder) placeholder.classList.add('hidden');
        } else {
            if (preview) preview.classList.add('hidden');
            if (placeholder) placeholder.classList.remove('hidden');
        }

        await updateDevicesList();

        if (loader) loader.classList.add('hidden');
        console.log('[Camera] Camera initialization complete.');
    } catch (error) {
        console.error('[Camera] Initialization failed:', error);
        const loader = $('camera-loader');
        if (loader) loader.classList.add('hidden');
        const placeholder = $('camera-placeholder');
        if (placeholder) placeholder.classList.remove('hidden');
        showGlobalError(`Camera access denied: ${error.message}`);
    }
}

function stopCamera() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null;
    }
    const preview = $('camera-preview');
    if (preview) preview.srcObject = null;
}

async function togglePreliveCamera() {
    isCameraOn = !isCameraOn;
    console.log('[Prelive] Toggle camera. New state:', isCameraOn);
    await initCamera();
}

async function togglePreliveMicrophone() {
    isMicOn = !isMicOn;
    console.log('[Prelive] Toggle microphone. New state:', isMicOn);
    await initCamera();
}

function toggleMirrorPreview() {
    isCameraMirrored = !isCameraMirrored;
    localStorage.setItem('prelive_camera_mirrored', isCameraMirrored);
    console.log('[Prelive] Toggle mirror. New state:', isCameraMirrored);
    updateMirrorPreview();
    
    const mirrorBtn = $('golive-btn-mirror');
    if (mirrorBtn) {
        mirrorBtn.classList.toggle('active', isCameraMirrored);
    }
}

function updateMirrorPreview() {
    const preview = $('camera-preview');
    if (preview) {
        if (isCameraMirrored) {
            preview.style.transform = 'scaleX(-1)';
        } else {
            preview.style.transform = 'none';
        }
    }
}

async function changeCameraDevice(deviceId) {
    console.log('[Devices] Camera device changed:', deviceId);
    selectedCameraId = deviceId;
    localStorage.setItem('prelive_camera_id', deviceId);
    if (isCameraOn) {
        await initCamera();
    }
}

async function changeMicDevice(deviceId) {
    console.log('[Devices] Microphone device changed:', deviceId);
    selectedMicId = deviceId;
    localStorage.setItem('prelive_mic_id', deviceId);
    if (isMicOn) {
        await initCamera();
    }
}

navigator.mediaDevices.addEventListener('devicechange', async () => {
    console.log('[Devices] Device list changed');
    if (currentScreen !== 'golive') return;

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoExists = devices.some(d => d.kind === 'videoinput' && d.deviceId === selectedCameraId);
    const audioExists = devices.some(d => d.kind === 'audioinput' && d.deviceId === selectedMicId);

    await updateDevicesList();

    if (isCameraOn && !videoExists) {
        console.warn('[Camera] Selected camera was unplugged. Reverting to default.');
        const firstVideo = devices.find(d => d.kind === 'videoinput');
        selectedCameraId = firstVideo ? firstVideo.deviceId : '';
        await initCamera();
    }

    if (isMicOn && !audioExists) {
        console.warn('[Microphone] Selected microphone was unplugged. Reverting to default.');
        const firstAudio = devices.find(d => d.kind === 'audioinput');
        selectedMicId = firstAudio ? firstAudio.deviceId : '';
        await initCamera();
    }
});

// Capture a single frame from the camera preview as a Blob (JPEG)
function captureThumbnail() {
    return new Promise((resolve) => {
        const video = $('camera-preview');
        if (!video || !video.srcObject || video.videoWidth === 0) {
            resolve(null);
            return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = 480;
        canvas.height = 270; // 16:9
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
    });
}

// Stream type picker
document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

$('go-live-btn').addEventListener('click', async () => {
    if (!currentUser) { showAuthOverlay('login'); return; }
    if (isGoLiveInProgress) return;
    isGoLiveInProgress = true;
    const title = $('stream-title').value || 'My Live Stream';
    const category = $('stream-category').value;
    const type = document.querySelector('.type-btn.active')?.dataset.type || 'public';

    const btn = $('go-live-btn');
    btn.disabled = true;
    btn.textContent = '📸 Capturing...';

    try {
        // 1. Capture a thumbnail frame from the camera preview
        const thumbnailBlob = await captureThumbnail();

        // 2. Build FormData so we can send both text fields + the image file
        const formData = new FormData();
        formData.append('title', title);
        formData.append('category', category);
        formData.append('type', type);
        if (thumbnailBlob) {
            formData.append('thumbnail', thumbnailBlob, 'thumb.jpg');
        }

        // 3. Create stream with thumbnail (multipart request – can't use apiReq helper)
        btn.textContent = '🚀 Going Live...';
        const res = await fetch(`${API}/api/streams`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
        });
        const stream = await res.json();
        if (!res.ok) throw new Error(stream.message || 'Failed to create stream');

        currentStream = stream;
        isHost = true;

        // 4. Fetch LiveKit token for host
        const tkData = await apiReq('POST', '/api/livekit/token', {
            room: stream.livekit_room,
            identity: currentUser.username,
            canPublish: true
        });

        // 5. Enter live screen with the token we just fetched (prevents double connection)
        await enterLiveScreen(stream, tkData.token);
    } catch (err) {
        alert('Failed to go live: ' + err.message);
    } finally {
        isGoLiveInProgress = false;
        btn.disabled = false;
        btn.innerHTML = '<span class="live-dot-anim"></span> GO LIVE';
    }
});


// ─── END STREAM ────────────────────────────────────────────────────────
async function endStream() {
    if (!currentStream || !isHost) return;
    try {
        await apiReq('PUT', `/api/streams/${currentStream.id}/end`);
        window.roomChannel?.send({
            type: 'broadcast',
            event: 'stream-ended',
            payload: { message: 'The host has ended the stream.' }
        });
        leaveLiveScreen();
    } catch (err) { alert(err.message); }
}

// ─── CHAT ──────────────────────────────────────────────────────────────
const chatInputEl = $('chat-input');
if (chatInputEl) {
    chatInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendChatMessage('live');
    });
}
function sendChatMessage(context) {
    const input = $('chat-input');
    const msg = input.value.trim();
    if (!msg || !currentStream) return;
    window.roomChannel?.send({
        type: 'broadcast',
        event: 'chat-message',
        payload: { username: currentUser ? currentUser.username : 'Guest', message: msg, avatar: currentUser ? currentUser.avatar : '' }
    });
    input.value = '';
}
function appendChat(username, message, isSystem = false, avatar = '') {
    const box = $('chat-messages');
    if (!box) return;
    const div = document.createElement('div');
    div.className = `chat-msg ${isSystem ? 'system-msg' : ''}`;

    if (isSystem) {
        div.innerHTML = `<span class="chat-msg-text" style="color:var(--accent2); font-weight:600">${message}</span>`;
    } else {
        const initials = username ? username.charAt(0).toUpperCase() : '?';
        const avatarUrl = toAssetUrl(avatar);
        const avatarHtml = `<div class="chat-avatar" style="${avatarUrl ? `background-image:url(${avatarUrl});background-size:cover;background-position:center;` : `background:var(--accent)`}">${avatarUrl ? '' : initials}</div>`;
        div.innerHTML = `${avatarHtml}<div class="chat-msg-content"><span class="chat-msg-name">${username}</span><span class="chat-msg-text">${message}</span></div>`;
    }

    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

// ─── REACTIONS ─────────────────────────────────────────────────────────
function sendReaction(emoji) {
    if (!currentStream) return;
    window.roomChannel?.send({
        type: 'broadcast',
        event: 'reaction',
        payload: { emoji, username: currentUser ? currentUser.username : 'Guest' }
    });
    showFloatingReaction(emoji);
}
function showFloatingReaction(emoji) {
    let overlay = $('reaction-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'reaction-overlay';
        overlay.className = 'reaction-overlay';
        const liveScreen = $('screen-live');
        if (liveScreen) {
            liveScreen.appendChild(overlay);
        } else {
            document.body.appendChild(overlay);
        }
        console.warn('[UI] reaction-overlay was missing. Created dynamically.');
    }
    const el = document.createElement('div');
    el.className = 'floating-reaction';
    el.textContent = emoji;
    el.style.left = Math.random() * 70 + 5 + '%';
    overlay.appendChild(el);
    setTimeout(() => el.remove(), 2500);
}

// ─── GIFTS ─────────────────────────────────────────────────────────────
let giftsCache = [];
async function loadGifts() {
    if (giftsCache.length) { renderGiftList(); return; }
    try {
        giftsCache = await retryAsync(() => apiReq('GET', '/api/gifts'), { retries: 1, delayMs: 500 });
        renderGiftList();
    } catch (err) {
        console.error('Failed to load gifts:', err);
    }
}
function renderGiftList() {
    const giftList = $('gift-list');
    if (!giftList) return;
    giftList.innerHTML = giftsCache.map((g, idx) => `
    <div class="gift-item" onclick="sendGiftByIndex(${idx})">
      <div class="gift-icon">${g.icon}</div>
      <div class="gift-name">${g.name}</div>
      <div class="gift-cost">🪙${g.coin_cost}</div>
    </div>
  `).join('');
}
function sendGiftByIndex(index) {
    const gift = giftsCache[index];
    if (!gift) {
        alert('Gift is unavailable. Please refresh and try again.');
        return;
    }
    return sendGift(gift);
}
function toggleGiftPanel(forceOpen = null) {
    if (!currentUser) { showAuthOverlay('login'); return; }
    const panel = $('gift-panel');
    if (!panel) return;
    const shouldOpen = typeof forceOpen === 'boolean'
        ? forceOpen
        : panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !shouldOpen);
}
function closeGiftPanel() {
    const panel = $('gift-panel');
    if (panel) panel.classList.add('hidden');
}
async function sendGift(giftInput) {
    if (!currentUser || !currentStream) return;
    if (isGiftSending) return;
    isGiftSending = true;
    const gift = typeof giftInput === 'object'
        ? giftInput
        : giftsCache.find((g) => String(g.id) === String(giftInput));
    if (!gift) {
        isGiftSending = false;
        return;
    }
    try {
        let receiverId = currentStream.host_id ?? currentStream.user_id ?? currentStream.host?.id;
        if (!receiverId && currentStream.id) {
            const latestStream = await apiReq('GET', `/api/streams/${currentStream.id}`);
            receiverId = latestStream.host_id ?? latestStream.user_id ?? latestStream.host?.id;
            if (receiverId) currentStream.host_id = receiverId;
        }
        if (!receiverId) {
            throw new Error('Unable to send gift: stream host is unavailable.');
        }
        if (Number(receiverId) === Number(currentUser.id)) {
            throw new Error('You cannot send gifts to your own stream.');
        }
        if ((Number(currentUser.coin_balance) || 0) < (Number(gift.coin_cost) || 0)) {
            throw new Error(`Insufficient coins. Need ${gift.coin_cost}, you have ${currentUser.coin_balance || 0}.`);
        }

        await apiReq('POST', '/api/gifts/send', {
            gift_id: gift.id,
            stream_id: currentStream.id,
            receiver_id: receiverId,
        });
        window.roomChannel?.send({
            type: 'broadcast',
            event: 'gift-animation',
            payload: {
                sender: currentUser ? currentUser.username : 'Guest',
                receiver: currentStream?.username,
                gift,
            }
        });
        showGiftBurst(gift.icon, 'You', gift.name);
        closeGiftPanel();
        // Refresh user coins locally
        currentUser.coin_balance = Math.max(0, (Number(currentUser.coin_balance) || 0) - Number(gift.coin_cost || 0));
        localStorage.setItem('tl_user', JSON.stringify(currentUser));
    } catch (err) {
        console.error('Gift send failed:', err);
        alert(err.message || 'Failed to send gift.');
    } finally {
        isGiftSending = false;
    }
}
function showGiftBurst(icon, sender, name) {
    const el = document.createElement('div');
    el.className = 'gift-burst';
    el.innerHTML = `${icon}<br><small style="font-size:.5em;opacity:.8">${sender} sent ${name}</small>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1600);
}

// ─── VIEWER GIFT SYSTEM ────────────────────────────────────────────────
let viewerGiftsCache = [];
let selectedViewerGift = null;
let selectedGiftId = null;
let selectedGift = null;
let selectedGiftCost = null;
let selectedGiftIcon = null;
let isViewerGiftSending = false;

async function loadViewerGifts() {
    console.log('[Gift] loadViewerGifts called. Cache length:', viewerGiftsCache.length);
    
    if (viewerGiftsCache.length) {
        console.log('[Gift] Using cached gifts');
        renderViewerGiftList();
        return;
    }
    
    try {
        console.log('[Gift] Fetching gifts from API');
        viewerGiftsCache = await retryAsync(() => apiReq('GET', '/api/gifts'), { retries: 1, delayMs: 500 });
        console.log('[Gift] Gifts loaded:', viewerGiftsCache);
        renderViewerGiftList();
    } catch (err) {
        console.error('[Gift] Failed to load viewer gifts:', err);
        renderViewerGiftList(); // Show empty state
    }
}

function renderViewerGiftList() {
    const giftList = document.getElementById('viewer-gift-list');
    if (!giftList) {
        console.warn('[Gift] viewer-gift-list element not found');
        return;
    }
    
    console.log('[Gift] Rendering gifts. Cache length:', viewerGiftsCache.length);
    
    if (viewerGiftsCache.length === 0) {
        giftList.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #999; padding: 20px; font-size: 0.9rem;">No gifts available</div>';
        return;
    }
    
    // Build HTML for all gifts
    giftList.innerHTML = viewerGiftsCache.map((g) => `
        <div class="viewer-gift-item ${String(selectedGiftId) === String(g.id) ? 'selected' : ''}" data-gift-id="${g.id}">
            <div class="gift-icon">${g.icon}</div>
            <div class="gift-name">${g.name}</div>
            <div class="gift-cost">🪙 ${g.coin_cost}</div>
        </div>
    `).join('');
    
    // Set up event delegation if not already done
    setupGiftListEventDelegation();

    // Update send button state
    const sendBtn = document.getElementById('viewer-send-gift-btn');
    if (sendBtn) {
        sendBtn.disabled = !selectedViewerGift;
        sendBtn.style.opacity = selectedViewerGift ? '1' : '0.5';
        console.log('[Gift] Send button state updated. Disabled:', !selectedViewerGift);
    }
}

// Setup event delegation once
function setupGiftListEventDelegation() {
    const giftList = document.getElementById('viewer-gift-list');
    if (!giftList) return;
    
    // Check if already setup (to avoid multiple listeners)
    if (giftList.dataset.delegationSetup === 'true') return;
    
    console.log('[Gift] Setting up event delegation for gift list');
    
    giftList.addEventListener('click', (event) => {
        const giftItem = event.target.closest('.viewer-gift-item');
        if (!giftItem) return;
        
        console.log('[Gift] Gift item clicked via delegation:', giftItem.dataset.giftId);
        event.stopPropagation();
        selectViewerGift(giftItem.dataset.giftId, event);
    });
    
    giftList.dataset.delegationSetup = 'true';
}

function selectViewerGift(giftId, event) {
    event?.stopPropagation?.();
    console.log('[Gift] selectViewerGift called:', giftId);
    
    // Find and store the gift
    selectedViewerGift = viewerGiftsCache.find(g => String(g.id) === String(giftId)) || null;
    selectedGiftId = selectedViewerGift?.id ?? null;
    selectedGift = selectedViewerGift;
    selectedGiftCost = selectedViewerGift?.coin_cost ?? null;
    selectedGiftIcon = selectedViewerGift?.icon ?? null;
    
    console.log('[Gift] Gift selected:', {
        id: selectedGiftId,
        name: selectedViewerGift?.name,
        cost: selectedGiftCost,
        icon: selectedGiftIcon
    });
    
    // Clear any previous error messages
    clearViewerGiftError();
    
    // Update UI without full re-render to preserve DOM and event listeners
    updateGiftSelectionUI();
    
    // Update send button state
    const sendBtn = document.getElementById('viewer-send-gift-btn');
    if (sendBtn) {
        sendBtn.disabled = !selectedViewerGift;
        sendBtn.style.opacity = selectedViewerGift ? '1' : '0.5';
    }
}

// Helper function to update UI without full DOM re-render
function updateGiftSelectionUI() {
    const giftList = document.getElementById('viewer-gift-list');
    if (!giftList) return;
    
    // Update visual state of all gift items
    giftList.querySelectorAll('.viewer-gift-item').forEach((item) => {
        const itemGiftId = String(item.dataset.giftId);
        const isSelected = itemGiftId === String(selectedGiftId);
        
        if (isSelected) {
            item.classList.add('selected');
            console.log('[Gift] Added "selected" class to gift:', itemGiftId);
        } else {
            item.classList.remove('selected');
        }
    });
}

async function sendViewerGift() {
    if (!currentUser) {
        console.log('[Gift] Not authenticated, showing auth overlay');
        showAuthOverlay('login');
        return;
    }
    
    if (!selectedViewerGift) {
        console.log('[Gift] No gift selected');
        showViewerGiftError('Please select a gift first');
        return;
    }
    
    if (!currentStream) {
        console.log('[Gift] No active stream');
        showViewerGiftError('No active stream');
        return;
    }
    
    if (isViewerGiftSending) {
        console.log('[Gift] Already sending a gift, ignoring duplicate request');
        return;
    }
    
    isViewerGiftSending = true;
    
    const sendBtn = document.getElementById('viewer-send-gift-btn');
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.textContent = '🎁 Sending...';
    }

    try {
        // Get receiver ID (stream host)
        let receiverId = currentStream.host_id ?? currentStream.user_id ?? currentStream.host?.id;
        console.log('[Gift] Initial receiver_id:', receiverId);
        
        // If receiver ID not found, fetch fresh stream data
        if (!receiverId && currentStream.id) {
            console.log('[Gift] Fetching fresh stream data to get host_id');
            try {
                const latestStream = await apiReq('GET', `/api/streams/${currentStream.id}`);
                receiverId = latestStream.host_id ?? latestStream.user_id ?? latestStream.host?.id;
                if (receiverId) {
                    currentStream.host_id = receiverId;
                    console.log('[Gift] Got receiver_id from fresh stream data:', receiverId);
                }
            } catch (e) {
                console.error('[Gift] Failed to fetch fresh stream data:', e);
            }
        }
        
        if (!receiverId) {
            throw new Error('Unable to send gift: stream host is unavailable. Please try again.');
        }
        
        // Prevent sending gift to self
        if (Number(receiverId) === Number(currentUser.id)) {
            throw new Error('You cannot send gifts to your own stream.');
        }
        
        // Check coin balance
        const senderBalance = Number(currentUser.coin_balance) || 0;
        const giftCost = Number(selectedViewerGift.coin_cost) || 0;
        
        console.log('[Gift] Checking balance. Sender balance:', senderBalance, 'Gift cost:', giftCost);
        
        if (senderBalance < giftCost) {
            throw new Error(`Not enough coins to send this gift. Need ${giftCost}, you have ${senderBalance}.`);
        }

        // Build and validate gift payload
        const giftPayload = {
            gift_id: selectedViewerGift.id,
            stream_id: currentStream.id,
            receiver_id: receiverId,
        };
        
        console.log('[Gift] Validating gift payload:', giftPayload);
        
        if (!giftPayload.gift_id || !giftPayload.stream_id || !giftPayload.receiver_id) {
            throw new Error(`Invalid gift payload. gift_id: ${giftPayload.gift_id}, stream_id: ${giftPayload.stream_id}, receiver_id: ${giftPayload.receiver_id}`);
        }
        
        // Send gift via API
        console.log('[Gift] Sending gift payload to /api/gifts/send...');
        const response = await apiReq('POST', '/api/gifts/send', giftPayload);
        
        console.log('[Gift] API response received:', response);
        
        if (!response || response.error) {
            throw new Error(response?.error?.message || response?.message || 'Failed to send gift');
        }

        // Success: Broadcast gift event to other viewers
        console.log('[Gift] Gift sent successfully. Broadcasting event...');
        
        if (window.roomChannel) {
            console.log('[Gift] Broadcasting gift-animation event via roomChannel');
            window.roomChannel.send({
                type: 'broadcast',
                event: 'gift-animation',
                payload: {
                    sender: currentUser.username,
                    receiver: currentStream.username,
                    gift: selectedViewerGift,
                }
            });
        } else {
            console.log('[Gift] roomChannel not available for broadcasting');
        }

        // Show success animation
        showGiftBurst(selectedViewerGift.icon, currentUser.username, selectedViewerGift.name);
        
        // Update user balance immediately
        const previousBalance = currentUser.coin_balance;
        currentUser.coin_balance = Math.max(0, senderBalance - giftCost);
        localStorage.setItem('tl_user', JSON.stringify(currentUser));
        
        console.log('[Gift] User balance updated. Previous:', previousBalance, 'New:', currentUser.coin_balance);
        
        // Show success message with gift name
        const giftName = selectedViewerGift?.name || 'Gift';
        showViewerGiftSuccess(`🎉 ${giftName} sent successfully!`);
        
        // Clear selection state AFTER success confirmation
        console.log('[Gift] Clearing gift selection state');
        selectedViewerGift = null;
        selectedGiftId = null;
        selectedGift = null;
        selectedGiftCost = null;
        selectedGiftIcon = null;
        
        clearViewerGiftError();
        updateGiftSelectionUI(); // Update UI to reflect cleared selection (no full re-render)
        
    } catch (err) {
        console.error('[Gift] Error sending gift:', err);
        const errorMsg = err.message || 'Failed to send gift. Please try again.';
        showViewerGiftError(errorMsg);
    } finally {
        isViewerGiftSending = false;
        const sendBtn = document.getElementById('viewer-send-gift-btn');
        if (sendBtn) {
            sendBtn.disabled = !selectedViewerGift;
            sendBtn.textContent = 'Send Gift';
            console.log('[Gift] Send button re-enabled. Disabled state:', !selectedViewerGift);
        }
    }
}

function showViewerGiftError(message) {
    const errorEl = document.getElementById('viewer-gift-error');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
        errorEl.style.color = '#ff6b6b';
        errorEl.style.background = 'rgba(255, 107, 107, 0.1)';
    }
}

function clearViewerGiftError() {
    const errorEl = document.getElementById('viewer-gift-error');
    if (errorEl) {
        errorEl.classList.add('hidden');
        errorEl.textContent = '';
    }
}

function showViewerGiftSuccess(message) {
    const errorEl = document.getElementById('viewer-gift-error');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.color = '#51cf66';
        errorEl.style.background = 'rgba(81, 207, 102, 0.1)';
        errorEl.classList.remove('hidden');
        setTimeout(() => {
            errorEl.classList.add('hidden');
            errorEl.style.color = '#ff6b6b';
            errorEl.style.background = 'rgba(255, 107, 107, 0.1)';
        }, 3000);
    }
}

// ─── WALLET ────────────────────────────────────────────────────────────
async function loadWallet() {
    if (!$('wallet-balance') || !$('wallet-transactions')) return;
    $('wallet-balance').textContent = '...';
    $('wallet-transactions').innerHTML = '';
    try {
        const data = await apiReq('GET', '/api/wallet');
        $('wallet-balance').textContent = data.coin_balance.toLocaleString();
        if (!data.transactions.length) {
            $('wallet-transactions').innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">No transactions yet</p>';
            return;
        }
        $('wallet-transactions').innerHTML = data.transactions.map(t => {
            const isGiftDebit = t.sender_id === currentUser.id && t.receiver_id !== currentUser.id && t.receiver_id !== null;
            const isWithdrawal = t.gift_name === 'Withdrawal';
            const isPurchase = t.gift_name === 'Coin Purchase';

            const isDebit = isGiftDebit || isWithdrawal; // Money leaving or being locked for withdrawal

            let typeLabel = isGiftDebit ? 'Gift Sent' : 'Gift Received';
            let icon = t.gift_icon || '🪙';
            let subText = isGiftDebit ? 'To ' + (t.receiver_name || '?') : 'From ' + (t.sender_name || '?');

            if (isPurchase) {
                typeLabel = 'Coins Purchased';
                icon = '💳';
                subText = 'via Credit Card';
            } else if (isWithdrawal) {
                typeLabel = 'Withdrawal Request';
                icon = '💸';
                subText = 'Pending Approval';
            }

            return `
        <div class="txn-item">
          <div class="txn-icon">${icon}</div>
          <div class="txn-info">
            <div class="txn-title">${typeLabel}</div>
            <div class="txn-sub">${subText}</div>
          </div>
          <div class="txn-amount ${isDebit ? 'debit' : 'credit'}">${isDebit ? '-' : '+'}${t.amount} 🪙</div>
        </div>
      `;
        }).join('');
    } catch (err) { $('wallet-balance').textContent = 'Error'; }
}

function showWithdrawModal() {
    if (!currentUser) { showAuthOverlay('login'); return; }
    $('withdraw-modal').classList.remove('hidden');
}
async function submitWithdrawal() {
    const amount = parseInt($('withdraw-amount').value);
    if (!amount || amount < 100) { showError('withdraw-msg', 'Minimum 100 coins'); return; }
    try {
        await apiReq('POST', '/api/wallet/withdraw', { amount });
        closeModal('withdraw-modal');

        // Sync the local current user profile
        if (currentUser) {
            currentUser.coin_balance -= amount;
            localStorage.setItem('tl_user', JSON.stringify(currentUser));
        }

        loadWallet(); // Refresh UI
        alert("Withdrawal request submitted! 100 coins have been deducted.");
    } catch (err) { showError('withdraw-msg', err.message); }
}

async function buyCoins(amount) {
    if (!currentUser) { showAuthOverlay('login'); return; }
    if (!confirm(`Confirm purchase of ${amount} coins?`)) return;

    try {
        await apiReq('POST', '/api/wallet/buy', { coins: amount });

        // Update local session
        if (currentUser) {
            currentUser.coin_balance += amount;
            localStorage.setItem('tl_user', JSON.stringify(currentUser));
        }

        loadWallet(); // Refresh UI
        alert(`Successfully added ${amount} coins to your wallet! 🪙`);
    } catch (err) {
        alert("Purchase failed: " + err.message);
    }
}



// Country flag mapping
const COUNTRY_FLAGS = {
    'US': '🇺🇸', 'GB': '🇬🇧', 'CA': '🇨🇦', 'AU': '🇦🇺', 'IN': '🇮🇳',
    'DE': '🇩🇪', 'FR': '🇫🇷', 'IT': '🇮🇹', 'ES': '🇪🇸', 'BR': '🇧🇷',
    'JP': '🇯🇵', 'CN': '🇨🇳', 'KR': '🇰🇷', 'MX': '🇲🇽', 'ID': '🇮🇩',
    'TR': '🇹🇷', 'SA': '🇸🇦', 'ZA': '🇿🇦', 'NG': '🇳🇬', 'AR': '🇦🇷',
    'CO': '🇨🇴', 'EG': '🇪🇬', 'PK': '🇵🇰', 'BD': '🇧🇩', 'RU': '🇷🇺',
    'PH': '🇵🇭', 'VN': '🇻🇳', 'TH': '🇹🇭', 'MY': '🇲🇾', 'SG': '🇸🇬',
    'NZ': '🇳🇿', 'IE': '🇮🇪', 'NL': '🇳🇱', 'SE': '🇸🇪', 'CH': '🇨🇭',
    'AE': '🇦🇪', 'IL': '🇮🇱', 'PT': '🇵🇹', 'PL': '🇵🇱', 'GR': '🇬🇷',
    'AT': '🇦🇹', 'BE': '🇧🇪', 'DK': '🇩🇰', 'FI': '🇫🇮', 'NO': '🇳🇴'
};

function getCountryFlag(code) {
    return COUNTRY_FLAGS[code] || '🏳️';
}

// ─── PROFILE ───────────────────────────────────────────────────────────
async function renderProfile() {
    const guest = $('profile-guest-msg');
    const user = $('profile-user');
    if (!guest || !user) return;
    if (!currentUser) {
        guest.classList.remove('hidden');
        user.classList.add('hidden');
    } else {
        guest.classList.add('hidden');
        user.classList.remove('hidden');

        try {
            // Fetch detailed profile data from database
            const data = await apiReq('GET', `/api/users/profile/${currentUser.id}`);

            // Update cached currentUser with fresh data
            currentUser = { ...currentUser, ...data };
            localStorage.setItem('tl_user', JSON.stringify(currentUser));

            // Basic info
            $('profile-username').textContent = data.username;
            $('profile-fullname').textContent = data.full_name || '';
            $('profile-bio').textContent = data.bio || '';

            // Avatar
            setAvatar($('profile-avatar-el'), data.avatar, data.username);

            // Meta info (age/country/join date)
            let metaHtml = '';
            if (data.date_of_birth) {
                const dob = new Date(data.date_of_birth);
                const today = new Date();
                let age = today.getFullYear() - dob.getFullYear();
                if (today.getMonth() < dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) {
                    age--;
                }
                metaHtml += `${age} years old`;
            }
            if (data.country) {
                if (metaHtml) metaHtml += ' • ';
                metaHtml += getCountryFlag(data.country) + ' ' + data.country;
            }
            $('profile-age-country').innerHTML = metaHtml;
            
            // Join date
            if (data.created_at) {
                const joinDate = new Date(data.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                $('profile-join-date').textContent = `Joined ${joinDate}`;
            }

            // Stats from database
            $('profile-followers').textContent = (data.followers_count || 0).toLocaleString();
            $('profile-followers').parentElement.onclick = () => openFollowList('followers', data.id);

            $('profile-following').textContent = (data.following_count || 0).toLocaleString();
            $('profile-following').parentElement.onclick = () => openFollowList('following', data.id);

            $('profile-posts-count').textContent = (data.posts_count || 0).toLocaleString();
            $('profile-fans-count').textContent = (data.fans_count || 0).toLocaleString();
            $('profile-gifts-count').textContent = (data.gifts_count || 0).toLocaleString();

            // Wallet
            $('profile-wallet').textContent = (data.coin_balance || 0).toLocaleString();

            // Calculate profile completion
            let completion = 0;
            let nextStep = 'Complete your profile';
            
            if (data.username) completion += 20;
            else nextStep = 'Add a username';
            
            if (data.avatar) completion += 20;
            else if (completion < 40) nextStep = 'Add a profile picture';
            
            if (data.bio) completion += 20;
            else if (completion < 60) nextStep = 'Write a bio';
            
            if (data.full_name) completion += 20;
            else if (completion < 80) nextStep = 'Add your full name';
            
            if (data.date_of_birth || data.country || data.gender) completion += 20;
            else if (completion < 100) nextStep = 'Add personal details';

            // Always update the percentage and bar width
            $('profile-completion-pct').textContent = completion + '%';
            $('profile-completion-bar').style.width = completion + '%';
            $('profile-completion-next').textContent = nextStep;

            const completionWrap = $('profile-completion-wrap');
            if (completion === 100) {
                // Hide completion bar when 100% complete
                completionWrap.classList.add('hidden');
                completionWrap.style.display = 'none';
            } else {
                completionWrap.classList.remove('hidden');
                completionWrap.style.display = '';
            }

            // Default tab selection and loading for own profile
            const defaultTab = document.querySelector('#screen-profile .profile-tab');
            if (defaultTab) {
                document.querySelectorAll('#screen-profile .profile-tab').forEach(b => b.classList.remove('active'));
                defaultTab.classList.add('active');
            }
            loadProfilePosts(data.id, 'all', 'profile-tab-content', true);

        } catch (e) {
            console.error("Profile fetch error", e);
        }
    }
}

function openProfileEditor() {
    if (!currentUser) return;
    $('edit-username').value = currentUser.username || '';
    $('edit-bio').value = currentUser.bio || '';
    $('edit-fullname').value = currentUser.full_name || '';
    $('edit-dob').value = currentUser.date_of_birth || '';
    $('edit-country').value = currentUser.country || '';
    $('edit-gender').value = currentUser.gender || '';
    $('profile-modal').classList.remove('hidden');
    setAvatar($('edit-avatar-preview'), currentUser.avatar, currentUser.username);
    
    // Add real-time completion calculation
    const updateCompletionPreview = () => {
        let completion = 0;
        if ($('edit-username').value.trim()) completion += 20;
        if (currentUser.avatar) completion += 20; // Avatar stays same unless changed
        if ($('edit-bio').value.trim()) completion += 20;
        if ($('edit-fullname').value.trim()) completion += 20;
        if ($('edit-dob').value || $('edit-country').value || $('edit-gender').value) completion += 20;
        
        const previewEl = $('modal-completion-preview');
        if (previewEl) {
            previewEl.textContent = completion + '%';
        }
    };
    
    const fields = ['edit-username', 'edit-bio', 'edit-fullname', 'edit-dob', 'edit-country', 'edit-gender'];
    fields.forEach(id => {
        const el = $(id);
        if (el) {
            el.removeEventListener('input', updateCompletionPreview);
            el.addEventListener('input', updateCompletionPreview);
        }
    });
    
    updateCompletionPreview();
}

function previewAvatar(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = $('edit-avatar-preview');
            preview.style.backgroundImage = `url(${e.target.result})`;
            preview.textContent = '';
        };
        reader.readAsDataURL(input.files[0]);
    }
}

async function saveProfile() {
    const username = $('edit-username').value.trim();
    const bio = $('edit-bio').value.trim();
    const full_name = $('edit-fullname').value.trim();
    const date_of_birth = $('edit-dob').value;
    const country = $('edit-country').value;
    const gender = $('edit-gender').value;
    const avatarFile = $('avatar-input').files[0];

    try {
        // 1. Update basic info
        await apiReq('PUT', '/api/users/profile', { 
            username, 
            bio, 
            full_name, 
            date_of_birth, 
            country, 
            gender 
        });

        // 2. Update avatar if a new one was selected
        if (avatarFile) {
            const formData = new FormData();
            formData.append('avatar', avatarFile);

            const res = await fetch(`${API}/api/users/profile/avatar`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            currentUser.avatar = data.avatar;

            // If user is currently hosting, update HUD avatar
            if (isHost) {
                setAvatar($('hud-host-avatar'), currentUser.avatar, currentUser.username);
            }
        }

        // Update local object
        currentUser.username = username;
        currentUser.bio = bio;
        currentUser.full_name = full_name;
        currentUser.date_of_birth = date_of_birth;
        currentUser.country = country;
        currentUser.gender = gender;
        localStorage.setItem('tl_user', JSON.stringify(currentUser));

        closeModal('profile-modal');
        renderProfile();
        renderTopBar();
    } catch (err) {
        alert("Failed to save: " + err.message);
    }
}

let viewProfileUserId = null;

async function viewUserProfile(userId, username = null, avatar = null) {
    if (currentUser && userId === currentUser.id) {
        navigateTo('profile');
        return;
    }

    const isSameUser = (viewProfileUserId === userId);
    viewProfileUserId = userId;

    if (currentScreen !== 'view-profile') {
        navigateTo('view-profile');
    }

    if (!isSameUser) {
        // Reset view and display pre-fetched user details instantly
        $('v-profile-username').textContent = username || 'Loading...';
        $('v-profile-bio').textContent = '';
        $('v-profile-fullname').textContent = '';
        $('v-profile-age-country').textContent = '';
        $('v-profile-join-date').textContent = '';
        $('v-profile-last-active').textContent = '';
        $('v-profile-followers').textContent = '0';
        $('v-profile-following').textContent = '0';
        $('v-profile-posts').textContent = '0';
        $('v-profile-fans').textContent = '0';
        $('v-profile-gifts').textContent = '0';
        $('v-follow-btn').classList.add('hidden');

        if (username) {
            setAvatar($('v-profile-avatar'), avatar, username);
        } else {
            $('v-profile-avatar').style.backgroundImage = '';
            $('v-profile-avatar').textContent = '';
        }
    }

    // Start loading posts concurrently (non-blocking)
    const postsPromise = loadProfilePosts(userId, 'all', 'v-profile-tab-content', false);

    try {
        const data = await apiReq('GET', `/api/users/profile/${userId}`);

        // Basic info
        $('v-profile-username').textContent = data.username;
        $('v-profile-fullname').textContent = data.full_name || '';
        $('v-profile-bio').textContent = data.bio || 'No bio provided.';

        // Meta info
        let metaHtml = '';
        if (data.date_of_birth) {
            const dob = new Date(data.date_of_birth);
            const today = new Date();
            let age = today.getFullYear() - dob.getFullYear();
            if (today.getMonth() < dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) {
                age--;
            }
            metaHtml += `${age} years old`;
        }
        if (data.gender) {
            if (metaHtml) metaHtml += ' • ';
            metaHtml += data.gender.charAt(0).toUpperCase() + data.gender.slice(1);
        }
        if (data.country) {
            if (metaHtml) metaHtml += ' • ';
            metaHtml += getCountryFlag(data.country) + ' ' + data.country;
        }
        $('v-profile-age-country').innerHTML = metaHtml;

        // Join date
        if (data.created_at) {
            const joinDate = new Date(data.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            $('v-profile-join-date').textContent = `Joined ${joinDate}`;
        }

        // Last active
        if (data.updated_at) {
            $('v-profile-last-active').textContent = formatRelativeTime(data.updated_at);
        }

        // Stats from database
        $('v-profile-followers').textContent = (data.followers_count || 0).toLocaleString();
        $('v-profile-followers').parentElement.onclick = () => openFollowList('followers', data.id);

        $('v-profile-following').textContent = (data.following_count || 0).toLocaleString();
        $('v-profile-following').parentElement.onclick = () => openFollowList('following', data.id);

        $('v-profile-posts').textContent = (data.posts_count || 0).toLocaleString();
        $('v-profile-fans').textContent = (data.fans_count || 0).toLocaleString();
        $('v-profile-gifts').textContent = (data.gifts_count || 0).toLocaleString();

        setAvatar($('v-profile-avatar'), data.avatar, data.username);

        // Setup message button
        $('v-message-btn').onclick = () => openChatThread(data.id, data.username);

        // Check follow status (which is returned directly in data)
        const btn = $('v-follow-btn');
        if (btn) {
            if (currentUser) {
                btn.classList.remove('hidden');
                const isFollowing = !!data.is_following;
                btn.classList.toggle('following', isFollowing);
                btn.textContent = isFollowing ? 'Following' : '+ Follow';
                
                // Show Invite button if I am the Host
                const inviteBtn = $('v-invite-btn');
                if (inviteBtn) {
                    if (isHost && currentStream && userId !== currentUser.id) {
                        inviteBtn.classList.remove('hidden');
                    } else {
                        inviteBtn.classList.add('hidden');
                    }
                }
            } else {
                btn.classList.remove('hidden');
                btn.textContent = '+ Follow';
                const inviteBtn = $('v-invite-btn');
                if (inviteBtn) inviteBtn.classList.add('hidden');
            }
        }

        // Default tab selection
        const defaultTab = document.querySelector('#screen-view-profile .profile-tab');
        if (defaultTab) {
            document.querySelectorAll('#screen-view-profile .profile-tab').forEach(b => b.classList.remove('active'));
            defaultTab.classList.add('active');
        }

        await postsPromise;
    } catch (e) {
        console.error("View profile error", e);
    }
}

async function toggleFollowProfile() {
    if (!currentUser) { showAuthOverlay('login'); return; }
    if (!viewProfileUserId) return;

    const btn = $('v-follow-btn');
    const isFollowing = btn.classList.contains('following');
    const method = isFollowing ? 'DELETE' : 'POST';

    try {
        await apiReq(method, `/api/users/follow/${viewProfileUserId}`);
        // Refresh view
        viewUserProfile(viewProfileUserId);
    } catch (err) {
        console.error("Follow error:", err);
    }
}

// ─── FOLLOW LIST ────────────────────────────────────────────────────────
let followListType = 'followers';
let followListUserId = null;

async function openFollowList(type, userId) {
    followListType = type;
    followListUserId = userId;
    navigateTo('follow-list');

    $('follow-list-title').textContent = type === 'followers' ? 'Followers' : 'Following';
    $('follow-list-content').innerHTML = '<div class="feed-loading"><div class="spinner"></div><p>Loading...</p></div>';

    try {
        const users = await apiReq('GET', `/api/users/${userId}/${type}`);
        renderFollowList(users);
    } catch (e) {
        $('follow-list-content').innerHTML = '<div class="feed-loading"><p>Failed to load.</p></div>';
    }
}

function renderFollowList(users) {
    const container = $('follow-list-content');
    if (!users.length) {
        container.innerHTML = `<div class="feed-loading"><p>No ${followListType} yet.</p></div>`;
        return;
    }

    container.innerHTML = users.map(u => {
        const initials = u.username.charAt(0).toUpperCase();
        const avatarUrl = toAssetUrl(u.avatar);
        const avatarStyle = avatarUrl ? `background-image:url(${avatarUrl}); background-size:cover; background-position:center;` : '';

        return `
            <div class="glass" style="display:flex; align-items:center; gap:12px; padding:15px; border-radius:16px; cursor:pointer; margin-bottom:10px;" onclick="viewUserProfile(${u.id}, '${u.username}', '${u.avatar || ''}')">
                <div class="user-avatar-sm" style="width:48px; height:48px; border:2px solid var(--glass-border); background: linear-gradient(135deg, var(--accent), var(--accent2)); ${avatarStyle}">${avatarUrl ? '' : initials}</div>
                <div style="flex:1">
                    <div style="font-weight:700; font-size:1.05rem">${u.username}</div>
                    <div style="font-size:0.85rem; color:rgba(255,255,255,0.6)">View Profile</div>
                </div>
                <div style="color:var(--accent); font-size:1.2rem">→</div>
            </div>
        `;
    }).join('');
}

function goBackFromFollowList() {
    if (viewProfileUserId) {
        navigateTo('view-profile');
        viewUserProfile(viewProfileUserId);
    } else {
        navigateTo('profile');
    }
}

function handleTrackMuteChange(pub, part, isMuted) {
    const identity = part.identity;
    const wrapper = $(`video-wrapper-${identity}`);

    if (pub.kind === 'video') {
        const video = wrapper ? wrapper.querySelector('video') : null;
        if (isMuted) {
            if (video) video.classList.add('hidden');
        } else {
            if (video) video.classList.remove('hidden');
        }
    } else if (pub.kind === 'audio') {
        const audioId = `audio-track-${part.identity}`;
        const audioEl = $(audioId);
        if (audioEl) {
            // If the host muted their mic, we mute the local playback element
            // (LiveKit usually stops the stream, but this ensures UI/state consistency)
            audioEl.muted = isMuted;
        }
    }
}

// ─── GUEST STREAMING LOGIC ───────────────────────────────────────────
function inviteToStream() {
    if (!viewProfileUserId || !currentStream || !isHost) return;
    socket?.send({
        type: 'broadcast',
        event: 'guest-invite-received',
        payload: { hostId: currentUser.id, hostName: currentUser.username, roomName: currentStream.livekit_room }
    });
    appendChat('System', `📡 Invitation sent to ${$('v-profile-username').textContent}`, true);
    closeModal('v-profile-modal');
    navigateTo('live');
}

async function acceptGuestInvite(accepted) {
    $('guest-invite-toast').classList.add('hidden');
    if (!pendingGuestInvite) return;

    const { hostId, roomName } = pendingGuestInvite;
    socket?.send({
        type: 'broadcast',
        event: 'guest-invite-reply',
        payload: { userId: currentUser.id, username: currentUser.username, accepted, roomName }
    });

    if (accepted) {
        switchToGuestStreamer(roomName);
    }
    pendingGuestInvite = null;
}

async function switchToGuestStreamer(roomName) {
    try {
        console.log('[Guest] Switching to streamer role...');
        // 1. Get new token with canPublish: true
        const tkData = await apiReq('POST', '/api/livekit/token', {
            room: roomName,
            identity: currentUser.username,
            canPublish: true
        });

        isGuestStreamer = true;

        // 2. Reconnect to LiveKit as Guest Streamer
        await connectToLiveKit(tkData.token, roomName);

        appendChat('System', '🎥 You are now live as a guest!', true);
    } catch (err) {
        alert('Failed to join as guest: ' + err.message);
        isGuestStreamer = false;
    }
}

function stopGuestStream() {
    if (!isGuestStreamer) return;
    isGuestStreamer = false;
    window.roomChannel?.send({
        type: 'broadcast',
        event: 'guest-left',
        payload: { userId: currentUser.id }
    });

    // Re-join as viewer (no publish)
    if (currentStream) {
        enterLiveScreen(currentStream).catch((err) => {
            console.error('Failed to switch back to viewer:', err);
        });
    }
}

function kickGuest(userId) {
    if (!isHost || !currentStream) return;
    socket?.send({
        type: 'broadcast',
        event: 'guest-kicked',
        payload: { roomName: currentStream.livekit_room }
    });
    // Also notify the room
    window.roomChannel?.send({
        type: 'broadcast',
        event: 'guest-left',
        payload: { userId }
    });
}

// ─── HOST CONTROLS ────────────────────────────────────────────────────
async function toggleMic() {
    if (!livekitRoom || !shouldPublishLocalTracks()) return;

    const connectionState = String(livekitRoom.state || '').toLowerCase();
    const isConnected =
        connectionState === 'connected' ||
        (typeof LivekitClient !== 'undefined' &&
            livekitRoom.state === LivekitClient.ConnectionState?.Connected);
    if (!isConnected) {
        alert('Still connecting to the stream engine... Please wait a second.');
        return;
    }

    const audioPub = Array.from(livekitRoom.localParticipant.audioTrackPublications.values())[0];
    const mediaTrackEnabled = mediaStream?.getAudioTracks?.()[0]?.enabled;
    const enabled = audioPub
        ? !audioPub.isMuted
        : (typeof mediaTrackEnabled === 'boolean'
            ? mediaTrackEnabled
            : !!livekitRoom.localParticipant.isMicrophoneEnabled);
    const btn = $('hud-mic-btn');
    if (!btn) return;
    btn.disabled = true; // Prevent double-clicks

    try {
        const targetEnabled = !enabled;
        // Keep publication stable; only toggle source + track mute state.
        if (mediaStream) {
            mediaStream.getAudioTracks().forEach((t) => { t.enabled = targetEnabled; });
        }
        await livekitRoom.localParticipant.setMicrophoneEnabled(targetEnabled, targetEnabled && selectedMicId ? { deviceId: selectedMicId } : undefined);
        const pubs = Array.from(livekitRoom.localParticipant.audioTrackPublications.values());
        for (const pub of pubs) {
            const track = pub?.track;
            if (!track) continue;
            if (track.mediaStreamTrack) track.mediaStreamTrack.enabled = targetEnabled;
            if (targetEnabled) {
                if (typeof track.unmute === 'function') await track.unmute();
            } else if (typeof track.mute === 'function') {
                await track.mute();
            }
        }

        const verifyPub = Array.from(livekitRoom.localParticipant.audioTrackPublications.values())[0];
        const verifyLocal = mediaStream?.getAudioTracks?.()[0]?.enabled;
        const isActuallyEnabled = verifyPub
            ? !verifyPub.isMuted
            : (typeof verifyLocal === 'boolean' ? verifyLocal : targetEnabled);
        if (isActuallyEnabled !== targetEnabled) {
            throw new Error('Microphone state did not update on published track');
        }
        await syncHostControlButtons();
    } catch (e) {
        console.error('Failed to toggle mic:', e);
        const msg = String(e?.message || '');
        // Error-specific feedback
        if (msg.includes('timeout')) {
            alert('Mic toggle timed out. The connection might be unstable.');
        } else if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied')) {
            alert('Microphone permission is blocked. Please allow mic access in your browser.');
        } else {
            alert('Could not toggle microphone. Please try again.');
        }
    } finally {
        btn.disabled = false;
    }
}

async function toggleCam() {
    if (!livekitRoom || !shouldPublishLocalTracks()) return;

    if (livekitRoom.state !== 'connected') {
        alert('Still connecting to the stream engine... Please wait a second.');
        return;
    }

    const enabled = !!livekitRoom.localParticipant.isCameraEnabled;
    const btn = $('hud-cam-btn');
    btn.disabled = true;

    try {
        await livekitRoom.localParticipant.setCameraEnabled(!enabled, !enabled && selectedCameraId ? { deviceId: selectedCameraId } : undefined);
        await syncHostControlButtons();
    } catch (e) {
        console.error('Failed to toggle camera:', e);
        if (e.message.includes('timeout')) {
            alert('Camera toggle timed out. The connection might be unstable.');
        }
    } finally {
        btn.disabled = false;
    }
}

// ─── VIEW VIEW CONTROLS (Local Playback) ──────────────────────────────
function toggleViewerAudio() {
    if (!currentStream) return;
    const audioId = `audio-track-${currentStream.username}`;
    const audioEl = $(audioId);
    const btn = $('viewer-mic-btn');
    if (!audioEl || !btn) return;

    const isMuted = audioEl.muted;
    audioEl.muted = !isMuted;

    if (audioEl.muted) {
        btn.classList.add('muted');
        btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M11 5 6 9 2 9v6h4l5 4V5zM23 9l-6 6M17 9l6 6"/></svg>`;
        btn.title = 'Unmute Audio';
    } else {
        btn.classList.remove('muted');
        btn.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
        btn.title = 'Mute Audio';
    }
}

function toggleViewerVideo() {
    if (!currentStream) return;
    const videoId = `video-${currentStream.username}`;
    const videoEl = $(videoId);
    const btn = $('viewer-cam-btn');
    if (!videoEl || !btn) return;

    const isHidden = videoEl.style.display === 'none';

    if (isHidden) {
        videoEl.style.display = 'block';
        btn.classList.remove('muted');
        btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
        btn.title = 'Hide Video';
    } else {
        videoEl.style.display = 'none';
        btn.classList.add('muted');
        btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
        btn.title = 'Show Video';
    }
}

// ─── PRIVATE/GROUP JOIN REQUEST ────────────────────────────────────────
async function showJoinRequestModal(stream) {
    $('joinreq-status').textContent = 'Sending request...';
    $('joinreq-modal').classList.remove('hidden');
    initSocket();
    joinRoom(stream.livekit_room);
    try {
        const reqData = await apiReq('POST', `/api/streams/${stream.id}/request`, {});
        $('joinreq-status').textContent = 'Waiting for host...';
        window.roomChannel?.send({
            type: 'broadcast',
            event: 'join-request-received',
            payload: {
                userId: currentUser.id,
                username: currentUser.username,
                avatar: currentUser.avatar,
                streamId: stream.id,
                requestId: reqData?.requestId || null
            }
        });
    } catch (err) {
        $('joinreq-status').textContent = `❌ ${err.message || 'Failed to send request.'}`;
    }
}

function showJoinRequestToast(userId, username, streamId, requestId = null) {
    pendingJoinRequest = { userId, streamId, requestId };
    $('join-req-username').textContent = username;
    $('join-request-toast').classList.remove('hidden');
    setTimeout(() => $('join-request-toast').classList.add('hidden'), 15000);
}

async function respondToJoinRequest(approved) {
    $('join-request-toast').classList.add('hidden');
    if (!pendingJoinRequest || !currentStream) return;
    const { userId, requestId } = pendingJoinRequest;
    const status = approved ? 'approved' : 'rejected';

    if (requestId) {
        try {
            await apiReq('PUT', `/api/streams/requests/${requestId}`, { status });
        } catch (err) {
            alert(`Failed to ${status} request: ${err.message}`);
            return;
        }
    }
    socket?.send({
        type: 'broadcast',
        event: 'join-response-' + userId,
        payload: { approved, roomName: currentStream?.livekit_room }
    });
    pendingJoinRequest = null;
}

// ─── PRIVATE CALL FUNCTIONS ────────────────────────────────────────

let privateCallActive = false;
let privateCallRoom = null;
let privateCallType = 'audio'; // 'audio' or 'video'
let privateCallPartnerId = null;
let privateCallPartnerName = null;
let privateCallPartnerAvatar = null;
let localCallAudioEnabled = true;
let localCallVideoEnabled = true;
let incomingCallData = null;
let currentCallId = null;
let privateCallLivekitRoom = null;

// Helper to ensure media permissions are granted before starting a call
async function requestMediaPermissions(type) {
    try {
        const constraints = {
            audio: true,
            video: type === 'video'
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        // Stop the tracks immediately as we only wanted to check/trigger the prompt
        stream.getTracks().forEach(t => t.stop());
        return true;
    } catch (err) {
        console.error('[Call] Permission check failed:', err);
        return false;
    }
}

// Initiate audio call
async function initiatePrivateAudioCall() {
    if (await requestMediaPermissions('audio')) {
        await startPrivateCall('audio');
    } else {
        alert('Microphone access is required for audio calls.');
    }
}

// Initiate video call
async function initiatePrivateVideoCall() {
    if (await requestMediaPermissions('video')) {
        await startPrivateCall('video');
    } else {
        alert('Camera and microphone access are required for video calls.');
    }
}

async function startPrivateCall(type) {
    if (!chatPartnerId || !currentUser) return;
    if (privateCallActive || privateCallLivekitRoom) {
        alert('You are already in a call or waiting for a response.');
        return;
    }
    
    privateCallType = type;
    privateCallPartnerId = chatPartnerId;
    privateCallPartnerName = $('chat-thread-partner-name').textContent;
    privateCallPartnerAvatar = $('chat-thread-partner-avatar').textContent;
    
    const roomName = `call_${Math.min(currentUser.id, chatPartnerId)}_${Math.max(currentUser.id, chatPartnerId)}_${Date.now()}`;
    privateCallRoom = roomName;

    // Show ringing overlay
    $('call-ringing-overlay').classList.remove('hidden');
    $('ringing-partner-name').textContent = privateCallPartnerName;
    
    try {
        // 1. Record call start in DB
        const call = await apiReq('POST', '/api/calls/start', {
            receiver_id: chatPartnerId,
            call_type: type
        });
        currentCallId = call.id;

        // 2. Get LiveKit token FIRST
        const tkData = await apiReq('POST', '/api/calls/token', {
            room: roomName,
            identity: currentUser.username
        });

        // 3. Send call invitation via GLOBAL socket channel
        if (socket) {
            socket.send({
                type: 'broadcast',
                event: 'private-call-request',
                payload: {
                    callerId: currentUser.id,
                    callerName: currentUser.username,
                    callerAvatar: currentUser.avatar,
                    callType: type,
                    receiverId: chatPartnerId,
                    roomName: roomName,
                    callId: call.id
                }
            });
        }

        // 4. Show the modal (so video elements exist in the DOM)
        updateCallModal();
        $('private-call-modal').classList.remove('hidden');
        privateCallActive = true;

        // 5. Connect to LiveKit room and publish our tracks
        await connectToPrivateCallLiveKit(tkData.token, roomName);

    } catch (err) {
        console.error('[Call] Failed to start call:', err);
        alert('Could not start call: ' + err.message);
        $('private-call-modal').classList.add('hidden');
        $('call-ringing-overlay').classList.add('hidden');
        privateCallActive = false;
    }
}

async function connectToPrivateCallLiveKit(token, roomName) {
    if (privateCallLivekitRoom) {
        try { await privateCallLivekitRoom.disconnect(); } catch (e) {}
        privateCallLivekitRoom = null;
    }

    const room = new LivekitClient.Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: {
            resolution: LivekitClient.VideoPresets.h720.resolution,
        }
    });
    privateCallLivekitRoom = room;

    // ─── DEDICATED track handler for the call room (isolated from main stream) ───
    room.on(LivekitClient.RoomEvent.TrackSubscribed, (track, publication, participant) => {
        console.log('[Call] Remote track subscribed:', track.kind, 'from', participant.identity);
        if (track.kind === 'video') {
            const remoteVid = $('remote-call-video');
            if (remoteVid) {
                track.detach(remoteVid);
                track.attach(remoteVid);
                remoteVid.play().catch(() => {});
                $('remote-call-placeholder').classList.add('hidden');
                $('call-status').textContent = 'Connected';
                console.log('[Call] Remote video attached successfully');
            }
        } else if (track.kind === 'audio') {
            const audioId = `private-call-audio-${participant.identity}`;
            let el = $(audioId);
            if (el) { el.pause(); el.remove(); }
            el = track.attach();
            el.id = audioId;
            el.autoplay = true;
            document.body.appendChild(el);
            el.play().catch(() => {});
        }
    });

    room.on(LivekitClient.RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        track.detach();
        if (track.kind === 'video') {
            $('remote-call-placeholder').classList.remove('hidden');
        }
    });

    room.on(LivekitClient.RoomEvent.LocalTrackPublished, (pub) => {
        if (pub.track.kind === 'video') {
            const localVid = $('local-call-video');
            if (localVid) {
                pub.track.detach(localVid);
                pub.track.attach(localVid);
                localVid.play().catch(() => {});
                $('local-call-placeholder').classList.add('hidden');
                console.log('[Call] Local video attached via LocalTrackPublished');
            }
        }
    });

    room.on(LivekitClient.RoomEvent.Disconnected, () => {
        console.log('[Call] Room disconnected');
        if (privateCallActive) endPrivateCall();
    });

    room.on(LivekitClient.RoomEvent.ParticipantConnected, (participant) => {
        console.log('[Call] Participant joined:', participant.identity);
        $('call-status').textContent = `${participant.identity} joined`;
    });

    try {
        await room.connect(await getLivekitUrl(), token);
        console.log('[Call] Connected to LiveKit room:', roomName, '| Participants:', room.remoteParticipants.size);

        $('call-status').textContent = 'Waiting for other participant...';

        // Handle any participants already in the room
        room.remoteParticipants.forEach((participant) => {
            participant.trackPublications.forEach((publication) => {
                if (publication.isSubscribed && publication.track) {
                    const fakeEvent = publication.track;
                    if (publication.track.kind === 'video') {
                        const remoteVid = $('remote-call-video');
                        if (remoteVid) {
                            publication.track.detach(remoteVid);
                            publication.track.attach(remoteVid);
                            remoteVid.play().catch(() => {});
                            $('remote-call-placeholder').classList.add('hidden');
                            $('call-status').textContent = 'Connected';
                        }
                    } else if (publication.track.kind === 'audio') {
                        const audioId = `private-call-audio-${participant.identity}`;
                        let el = $(audioId);
                        if (el) { el.pause(); el.remove(); }
                        el = publication.track.attach();
                        el.id = audioId;
                        document.body.appendChild(el);
                        el.play().catch(() => {});
                    }
                }
            });
        });

        // Enable microphone for all calls
        await room.localParticipant.setMicrophoneEnabled(true);
        localCallAudioEnabled = true;

        // Enable camera for video calls
        if (privateCallType === 'video') {
            await room.localParticipant.setCameraEnabled(true);
            localCallVideoEnabled = true;

            // Attach local video immediately after enabling camera
            const videoPubs = Array.from(room.localParticipant.videoTrackPublications.values());
            for (const pub of videoPubs) {
                if (pub.track) {
                    const localVid = $('local-call-video');
                    if (localVid) {
                        pub.track.detach(localVid);
                        pub.track.attach(localVid);
                        localVid.play().catch(() => {});
                        $('local-call-placeholder').classList.add('hidden');
                        console.log('[Call] Local video attached immediately after setCameraEnabled');
                    }
                    break;
                }
            }
        } else {
            localCallVideoEnabled = false;
        }

        // Update UI buttons
        const audioBtn = $('call-mute-btn');
        if (audioBtn) { audioBtn.textContent = '🎤'; audioBtn.style.background = 'var(--accent)'; }
        const videoBtn = $('call-video-btn');
        if (videoBtn) {
            videoBtn.textContent = privateCallType === 'video' ? '📹' : '📷';
            videoBtn.style.background = privateCallType === 'video' ? 'var(--accent)' : '#555';
        }

    } catch (err) {
        console.error('[Call] LiveKit connection failed:', err);
        privateCallLivekitRoom = null;
        throw err;
    }
}

// Accept incoming call
async function acceptPrivateCall() {
    if (!incomingCallData) return;
    
    const { roomName, callId, callerId, callerName, callerAvatar, callType } = incomingCallData;
    incomingCallData = null;
    
    $('incoming-call-notification').classList.add('hidden');
    
    privateCallActive = true;
    privateCallType = callType;
    privateCallPartnerId = callerId;
    privateCallPartnerName = callerName;
    privateCallPartnerAvatar = callerAvatar;
    privateCallRoom = roomName;
    currentCallId = callId;
    
    // Show the modal first so video elements exist in DOM
    updateCallModal();
    $('private-call-modal').classList.remove('hidden');
    $('call-status').textContent = 'Connecting...';
    
    try {
        // 1. Get LiveKit token
        const tkData = await apiReq('POST', '/api/calls/token', {
            room: roomName,
            identity: currentUser.username
        });

        // 2. Connect to LiveKit (receiver joins the room the caller created)
        await connectToPrivateCallLiveKit(tkData.token, roomName);

        // 3. Send acceptance via GLOBAL socket so caller knows
        if (socket) {
            socket.send({
                type: 'broadcast',
                event: 'private-call-accepted',
                payload: {
                    callerId: callerId,
                    receiverId: currentUser.id,
                    callType: callType
                }
            });
        }
    } catch (err) {
        console.error('[Call] Failed to accept call:', err);
        alert('Error connecting to call: ' + err.message);
        endPrivateCall();
    }
}

// Reject incoming call
function rejectPrivateCall() {
    if (!incomingCallData) return;
    
    $('incoming-call-notification').classList.add('hidden');
    
    // Send rejection via GLOBAL socket
    if (socket) {
        socket.send({
            type: 'broadcast',
            event: 'private-call-rejected',
            payload: {
                callerId: incomingCallData.callerId,
                receiverId: currentUser.id
            }
        });
    }
    
    incomingCallData = null;
}

// Cancel outgoing call
async function cancelPrivateCall() {
    $('call-ringing-overlay').classList.add('hidden');
    
    if (currentCallId) {
        apiReq('PUT', `/api/calls/${currentCallId}/end`, { status: 'missed' }).catch(() => {});
    }

    if (socket && privateCallPartnerId) {
        socket.send({
            type: 'broadcast',
            event: 'private-call-cancelled',
            payload: {
                callerId: currentUser.id,
                receiverId: privateCallPartnerId
            }
        });
    }
    
    if (privateCallLivekitRoom) {
        privateCallLivekitRoom.disconnect();
        privateCallLivekitRoom = null;
    }

    resetPrivateCall();
}

// End active call and clean up
async function endPrivateCall() {
    if (!privateCallActive && !privateCallLivekitRoom) {
        // Just in case UI is still visible
        $('private-call-modal').classList.add('hidden');
        $('call-ringing-overlay').classList.add('hidden');
        return;
    }
    
    console.log('[Call] Ending call...');

    // Record end in DB
    if (currentCallId) {
        apiReq('PUT', `/api/calls/${currentCallId}/end`, { status: 'completed' }).catch(() => {});
    }

    // Disconnect LiveKit
    if (privateCallLivekitRoom) {
        privateCallLivekitRoom.disconnect();
        privateCallLivekitRoom = null;
    }
    
    // Send end call notification via GLOBAL socket
    if (socket && privateCallPartnerId) {
        socket.send({
            type: 'broadcast',
            event: 'private-call-ended',
            payload: {
                callerId: currentUser.id,
                receiverId: privateCallPartnerId
            }
        });
    }
    
    resetPrivateCall();
    
    // Reset UI elements
    $('private-call-modal').classList.add('hidden');
    $('call-ringing-overlay').classList.add('hidden');
    
    const remoteVid = $('remote-call-video');
    if (remoteVid) remoteVid.srcObject = null;
    const localVid = $('local-call-video');
    if (localVid) localVid.srcObject = null;
}

// Redundant functions removed as LiveKit handles tracks directly
// startLocalCallAudio, startLocalCallVideo, stopLocalCallMedia are no longer needed

// Toggle call audio
async function toggleCallAudio() {
    if (!privateCallLivekitRoom) return;
    
    localCallAudioEnabled = !localCallAudioEnabled;
    await privateCallLivekitRoom.localParticipant.setMicrophoneEnabled(localCallAudioEnabled);
    
    const btn = $('call-mute-btn');
    if (btn) {
        btn.textContent = localCallAudioEnabled ? '🎤' : '🔇';
        btn.style.background = localCallAudioEnabled ? 'var(--accent)' : '#ff4444';
    }
}

// Toggle call video
async function toggleCallVideo() {
    if (!privateCallLivekitRoom) return;
    
    localCallVideoEnabled = !localCallVideoEnabled;
    await privateCallLivekitRoom.localParticipant.setCameraEnabled(localCallVideoEnabled);
    
    const btn = $('call-video-btn');
    if (btn) {
        btn.textContent = localCallVideoEnabled ? '📹' : '📷';
        btn.style.background = localCallVideoEnabled ? 'var(--accent)' : '#ff4444';
    }
    
    const placeholder = $('local-call-placeholder');
    if (placeholder) {
        placeholder.classList.toggle('hidden', localCallVideoEnabled);
    }
}

// Update call modal with partner info
function updateCallModal() {
    $('call-partner-name').textContent = privateCallPartnerName;
    $('call-partner-avatar').textContent = privateCallPartnerAvatar || '?';
    $('remote-call-avatar').textContent = privateCallPartnerAvatar || '?';
    
    const placeholderText = $('remote-call-placeholder')?.querySelector('p');
    if (placeholderText) {
        placeholderText.textContent = privateCallType === 'video' ? 'Waiting for video...' : 'Audio Call Active';
    }
    
    // Hide local video wrapper if audio call
    const localWrapper = $('local-call-video-wrapper');
    if (localWrapper) {
        localWrapper.style.display = privateCallType === 'video' ? 'block' : 'none';
    }
}

// Reset private call state
function resetPrivateCall() {
    privateCallActive = false;
    privateCallRoom = null;
    privateCallType = 'audio';
    privateCallPartnerId = null;
    privateCallPartnerName = null;
    privateCallPartnerAvatar = null;
    localCallAudioEnabled = true;
    localCallVideoEnabled = true;
    incomingCallData = null;
    currentCallId = null;
}

// Handle incoming call request
function handleIncomingCallRequest(payload) {
    if (payload.receiverId !== currentUser.id) return;
    
    // If already in a call or has an incoming one, ignore or handle as busy
    if (privateCallActive || incomingCallData) {
        console.log('[Call] Busy: Ignoring incoming call from', payload.callerName);
        return;
    }
    
    incomingCallData = payload;
    
    // Show incoming call notification
    $('incoming-call-avatar').textContent = payload.callerAvatar || '?';
    $('incoming-call-name').textContent = payload.callerName;
    $('incoming-call-type').textContent = `is calling with ${payload.callType}...`;
    $('incoming-call-notification').classList.remove('hidden');
    
    // Play ringtone
    playCallRingtone();
}


// Handle call accepted - caller gets this when receiver picks up
function handleCallAccepted(payload) {
    if (payload.callerId !== currentUser.id) return;
    console.log('[Call] Call accepted by receiver');
    
    // Modal is already shown (we showed it before connecting)
    // Just hide the ringing overlay and update status
    $('call-ringing-overlay').classList.add('hidden');
    $('call-status').textContent = 'Connected';
    updateCallModal();

    // Resume video if paused (browsers may pause while ringing overlay was on top)
    const remoteVid = $('remote-call-video');
    if (remoteVid && remoteVid.srcObject && remoteVid.paused) {
        remoteVid.play().catch(() => {});
    }
    const localVid = $('local-call-video');
    if (localVid && localVid.srcObject && localVid.paused) {
        localVid.play().catch(() => {});
    }
}

// Handle call rejected
function handleCallRejected(payload) {
    if (payload.callerId !== currentUser.id) return;
    
    $('call-ringing-overlay').classList.add('hidden');
    alert(`${privateCallPartnerName} rejected your call`);
    resetPrivateCall();
}

// Handle call cancelled
function handleCallCancelled(payload) {
    if (payload.receiverId !== currentUser.id) return;
    
    $('incoming-call-notification').classList.add('hidden');
    incomingCallData = null;
}

// Handle call ended (receiver gets this when caller hangs up)
function handleCallEnded(payload) {
    if (payload.receiverId !== currentUser.id) return;
    console.log('[Call] Remote party ended the call');
    
    if (privateCallLivekitRoom) {
        privateCallLivekitRoom.disconnect();
        privateCallLivekitRoom = null;
    }
    $('private-call-modal').classList.add('hidden');
    // Clean up audio elements
    document.querySelectorAll('[id^="private-call-audio-"]').forEach(el => el.remove());
    resetPrivateCall();
}

// Play call ringtone
function playCallRingtone() {
    // Create a simple beep sound using Web Audio API
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (err) {
        console.warn('Could not play ringtone:', err);
    }
}

// ─── MODAL HELPERS ─────────────────────────────────────────────────────
function closeModal(id) { $(id)?.classList.add('hidden'); }

// ─── HELPERS ───────────────────────────────────────────────────────────
function setAvatar(el, avatarUrl, username) {
    if (!el) return;
    const normalizedAvatar = toAssetUrl(avatarUrl);
    if (normalizedAvatar) {
        el.style.backgroundImage = `url(${normalizedAvatar})`;
        el.textContent = '';
        el.classList.add('has-img');
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
    } else {
        el.style.backgroundImage = 'none';
        el.textContent = username ? username.charAt(0).toUpperCase() : '?';
        el.classList.remove('has-img');
    }
}

// ─── INIT ──────────────────────────────────────────────────────────────
(function init() {
    renderTopBar();
    initSocket();
    initSearch();
    loadStreams();
    document.addEventListener('click', (event) => {
        // This handler only manages the HOST/old gift panel popup (not the permanent viewer gift panel).
        // The viewer-gift-panel is a permanent sidebar element and must never be closed by outside clicks.
        if (currentScreen === 'live' && !isHost) return; // viewer mode — do nothing
        const panel = $('gift-panel');
        if (!panel || panel.classList.contains('hidden')) return;
        const target = event.target;
        // If the click target is no longer attached to the document (e.g. after a re-render
        // destroyed it mid-event), do not treat it as an outside click.
        if (!document.documentElement.contains(target)) return;
        const giftBtn = target?.closest?.('.live-actions-right .action-btn[title="Gift"]');
        if (giftBtn) return;
        if (!panel.contains(target)) {
            closeGiftPanel();
        }
    });

    // Pre-fetch config to speed up connections
    apiReq('GET', '/api/config').then(data => {
        cachedLivekitUrl = normalizeLivekitUrl(data.livekitUrl);
        if (data.firebaseConfig) {
            initFirebase(data.firebaseConfig);
        }
    }).catch(() => { });

    // If no user, show auth on first load after brief delay
    if (!currentUser) {
        setTimeout(() => {
            if (!currentUser) showAuthOverlay('login');
        }, 1000);
    }
})();

window.addEventListener('error', (event) => {
    console.error('[App Runtime Error]', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('[App Unhandled Promise Rejection]', event.reason);
});


/* ═══════════════════════════════════════════════════════════════════════════════
   PROFILE TABS AND POSTS
   ═══════════════════════════════════════════════════════════════════════════════ */

function switchProfileTab(tab, btn) {
    document.querySelectorAll('#screen-profile .profile-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadProfilePosts(currentUser.id, tab, 'profile-tab-content', true);
}

function switchViewProfileTab(tab, btn) {
    document.querySelectorAll('#screen-view-profile .profile-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadProfilePosts(viewProfileUserId, tab, 'v-profile-tab-content', false);
}

async function loadProfilePosts(userId, tab, containerId, isOwnProfile) {
    const container = $(containerId);
    if (!container) return;

    if (tab === 'fans') {
        container.innerHTML = '<div class="upload-area"><span style="font-size:3rem">🔒</span><p>This content is exclusively for fans.</p></div>';
        return;
    }
    if (tab === 'gifts') {
        container.innerHTML = '<div class="upload-area"><span style="font-size:3rem">🎁</span><p>Gift collections coming soon.</p></div>';
        return;
    }

    container.innerHTML = '<div class="feed-loading"><div class="spinner"></div></div>';
    
    try {
        const posts = await apiReq('GET', `/api/posts/user/${userId}`);
        
        let filtered = posts;
        if (tab === 'moments') {
            filtered = posts.filter(p => false);
        }

        if (filtered.length === 0) {
            container.innerHTML = '<div class="upload-area"><span style="font-size:3rem">📷</span><p>No posts yet.</p></div>';
            if (isOwnProfile && tab !== 'posts') {
                if ($('profile-posts-count')) $('profile-posts-count').textContent = '0';
            }
            if (!isOwnProfile && $('v-profile-posts')) {
                $('v-profile-posts').textContent = '0';
            }
            return;
        }

        if (isOwnProfile && tab === 'all') {
            if ($('profile-posts-count')) $('profile-posts-count').textContent = filtered.length;
        }
        if (!isOwnProfile && tab === 'all' && $('v-profile-posts')) {
            $('v-profile-posts').textContent = filtered.length;
        }

        let html = '<div class="grid-3-cols">';
        filtered.forEach(p => {
            const mediaUrl = p.media_url || '';
            const isVideo = mediaUrl.match(/\.mp4|\.webm/i) || p.media_type === 'video';
            html += '<div class="grid-item" onclick="openPostDetail(\'' + p.id + '\')">';
            if (isVideo) {
                html += '<video src="' + toAssetUrl(mediaUrl) + '" muted loop></video>';
            } else {
                html += '<img src="' + toAssetUrl(mediaUrl) + '" />';
            }
            html += '<div class="grid-overlay">';
            html += '<span>❤️ ' + (p.likes_count || 0) + '</span>';
            html += '<span>💬 ' + (p.comments_count || 0) + '</span>';
            html += '</div></div>';
        });
        html += '</div>';
        container.innerHTML = html;
        
    } catch (e) {
        console.error(e);
        container.innerHTML = '<p>Error loading posts.</p>';
    }
}

let cpSelectedFiles = [];

function openCreatePostModal() {
    $('create-post-modal').classList.remove('hidden');
    cpSelectedFiles = [];
    $('cp-media-preview').innerHTML = '';
    $('cp-media-preview').classList.add('hidden');
    $('cp-next-1').disabled = true;
    $('cp-caption').value = '';
    $('cp-hashtags').value = '';
    $('cp-location').value = '';
    $('cp-upload-progress').classList.add('hidden');
    nextPostStep(1);
}

let lottieUploadAnim = null;

function initLottieAnimation() {
    if (!lottieUploadAnim) {
        lottieUploadAnim = lottie.loadAnimation({
            container: $('lottie-upload-container'),
            renderer: 'svg',
            loop: true,
            autoplay: false,
            path: 'uploads/6ac0c17e-1152-11ee-a821-83824ddc0ded.json' // path to animation json
        });
    }
}

function handlePostMediaSelect(event) {
    const files = event.target.files;
    if (!files.length) return;
    
    cpSelectedFiles = Array.from(files);
    const preview = $('cp-media-preview');
    preview.innerHTML = '';
    preview.classList.remove('hidden');
    
    cpSelectedFiles.forEach(file => {
        const item = document.createElement('div');
        item.style.width = '100%';
        item.style.height = '100px';
        item.style.borderRadius = '8px';
        item.style.overflow = 'hidden';
        item.style.background = '#000';
        
        const url = URL.createObjectURL(file);
        if (file.type.startsWith('video/')) {
            item.innerHTML = `<video src="${url}" muted autoplay loop style="width:100%; height:100%; object-fit:cover;"></video>`;
        } else {
            item.innerHTML = `<img src="${url}" style="width:100%; height:100%; object-fit:cover;" />`;
        }
        preview.appendChild(item);
    });
    
    $('cp-next-1').disabled = false;
}

function nextPostStep(step) {
    document.querySelectorAll('.cp-step').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.cp-step').forEach(el => el.classList.remove('active'));
    $(`cp-step-${step}`).classList.remove('hidden');
    $(`cp-step-${step}`).classList.add('active');
}

function uploadFileWithProgress(file, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API}/api/upload`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.upload.onprogress = e => {
            if (e.lengthComputable) {
                onProgress(e.loaded / e.total);
            }
        };
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(JSON.parse(xhr.responseText));
            } else {
                reject(new Error('Upload failed'));
            }
        };
        xhr.onerror = () => reject(new Error('Upload failed'));
        const formData = new FormData();
        formData.append('media', file);
        xhr.send(formData);
    });
}

async function submitPost() {
    if (!cpSelectedFiles.length) return;

    const overlay = $('cp-upload-overlay');
    overlay.classList.remove('hidden');
    
    initLottieAnimation();
    lottieUploadAnim.play();
    
    const progressText = $('cp-progress-text');
    
    try {
        const uploadedMedia = [];
        const totalFiles = cpSelectedFiles.length;
        
        for (let i = 0; i < totalFiles; i++) {
            const file = cpSelectedFiles[i];
            const result = await uploadFileWithProgress(file, (progress) => {
                const baseProgress = (i / totalFiles) * 100;
                const fileProgress = progress * (100 / totalFiles);
                const totalProgress = Math.round(baseProgress + fileProgress);
                progressText.textContent = `${totalProgress}%`;
            });
            uploadedMedia.push(result);
        }
        
        progressText.textContent = '100%';
        
        const rawHashtags = $('cp-hashtags').value;
        const hashtags = rawHashtags.split(',').map(t => t.trim().replace(/^#/, '')).filter(t => t);
        
        const postPayload = {
            caption: $('cp-caption').value.trim(),
            location: $('cp-location').value.trim(),
            hashtags: hashtags,
            media_url: JSON.stringify(uploadedMedia),
            media_type: uploadedMedia[0].type
        };

        await apiReq('POST', '/api/posts', postPayload);
        
        closeModal('create-post-modal');
        lottieUploadAnim.stop();
        overlay.classList.add('hidden');
        renderProfile(); // refresh posts
    } catch (err) {
        alert("Failed to create post: " + err.message);
        lottieUploadAnim.stop();
        overlay.classList.add('hidden');
    }
}

let currentPostDetailId = null;

async function openPostDetail(postId) {
    currentPostDetailId = postId;
    $('post-detail-modal').classList.remove('hidden');
    $('pd-media-container').innerHTML = '<div class="spinner"></div>';
    
    try {
        const post = await apiReq('GET', `/api/posts/${postId}`);
        
        let mediaHtml = '';
        if (post.media_url) {
            let mediaItems = [];
            if (post.media_url.startsWith('[')) {
                try { mediaItems = JSON.parse(post.media_url); } catch(e){}
            } else {
                mediaItems = [{ url: post.media_url, type: post.media_type || (post.media_url.match(/\.(mp4|webm)$/i) ? 'video' : 'image') }];
            }
            
            if (mediaItems.length > 0) {
                mediaHtml = '<div style="display:flex; overflow-x:auto; scroll-snap-type: x mandatory; width:100%; height:100%;">';
                mediaItems.forEach(item => {
                    const url = item.url;
                    mediaHtml += '<div style="flex: 0 0 100%; scroll-snap-align: center; height:100%; display:flex; align-items:center; justify-content:center; background:#000;">';
                    if (item.type === 'video' || url.match(/\.(mp4|webm)$/i)) {
                        mediaHtml += `<video src="${toAssetUrl(url)}" controls autoplay loop style="max-width:100%; max-height:100%; object-fit:contain;"></video>`;
                    } else {
                        mediaHtml += `<img src="${toAssetUrl(url)}" style="max-width:100%; max-height:100%; object-fit:contain;" />`;
                    }
                    mediaHtml += '</div>';
                });
                mediaHtml += '</div>';
                // Add simple dots indicator if multiple images
                if (mediaItems.length > 1) {
                    mediaHtml += '<div style="position:absolute; bottom:15px; left:0; width:100%; display:flex; justify-content:center; gap:6px; pointer-events:none;">';
                    for (let i=0; i<mediaItems.length; i++) {
                        mediaHtml += '<div style="width:6px; height:6px; border-radius:50%; background:rgba(255,255,255,0.7); box-shadow:0 1px 3px rgba(0,0,0,0.5);"></div>';
                    }
                    mediaHtml += '</div>';
                }
            }
        }
        $('pd-media-container').innerHTML = mediaHtml;
        
        $('pd-author-name').textContent = post.author_name || 'Username';
        setAvatar($('pd-author-avatar'), post.author_avatar, post.author_name);
        $('pd-caption').textContent = post.caption || '';
        
        if (post.location) {
            const locEl = $('pd-location');
            if (locEl) {
                locEl.textContent = '\uD83D\uDCCD ' + post.location;
                locEl.classList.remove('hidden');
            }
        } else {
            const locEl = $('pd-location');
            if (locEl) locEl.classList.add('hidden');
        }
        $('pd-like-count').textContent = post.likes_count || 0;
        
        // Hashtags
        const tags = Array.isArray(post.hashtags) ? post.hashtags : JSON.parse(post.hashtags || '[]');
        if (tags.length > 0) {
            $('pd-hashtags').innerHTML = tags.map(t => `#${t}`).join(' ');
        } else {
            $('pd-hashtags').innerHTML = '';
        }

        // Check if liked/saved
        try {
            const status = await apiReq('GET', `/api/posts/${postId}/status`);
            $('pd-like-btn').style.color = status.liked ? 'var(--danger)' : '#fff';
            $('pd-save-btn').style.color = status.saved ? 'var(--accent)' : '#fff';
        } catch(e) {}

        // Load Comments
        loadPostComments(postId);

        // Check post ownership to show options button
        const optionsBtn = $('pd-options-btn');
        if (optionsBtn) {
            const isAuthor = currentUser && (Number(post.user_id) === Number(currentUser.id) || post.author_name === currentUser.username);
            optionsBtn.classList.toggle('hidden', !isAuthor);
        }
        $('pd-options-menu')?.classList.add('hidden');

    } catch (err) {
        console.error(err);
        $('pd-media-container').innerHTML = '<p>Error loading post.</p>';
    }
}

function togglePostOptions() {
    $('pd-options-menu')?.classList.toggle('hidden');
}

async function confirmDeletePost() {
    if (!currentPostDetailId) return;
    const confirmDelete = confirm("Are you sure you want to delete this post? This action cannot be undone.");
    if (!confirmDelete) return;

    try {
        await apiReq('DELETE', `/api/posts/${currentPostDetailId}`);
        closeModal('post-detail-modal');
        
        // Refresh appropriate profile screens
        if (currentScreen === 'profile') {
            renderProfile();
        } else if (currentScreen === 'view-profile' && viewProfileUserId) {
            viewUserProfile(viewProfileUserId);
        }
        
        alert("Post deleted successfully.");
    } catch (err) {
        alert("Failed to delete post: " + err.message);
    }
}

async function loadPostComments(postId) {
    try {
        const comments = await apiReq('GET', `/api/posts/${postId}/comments`);
        const list = $('pd-comments-list');
        list.innerHTML = comments.map(c => `
            <div class="comment-item">
                <div class="comment-avatar" style="${c.author_avatar ? `background-image:url(${toAssetUrl(c.author_avatar)})` : 'background:var(--accent)'}"></div>
                <div class="comment-text">
                    <strong>${c.author_name}</strong> ${c.content}
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error(err);
    }
}

async function togglePostLike() {
    if (!currentPostDetailId || !currentUser) return;
    try {
        const res = await apiReq('POST', `/api/posts/${currentPostDetailId}/like`);
        $('pd-like-btn').style.color = res.liked ? 'var(--danger)' : '#fff';
        
        // Reload detail to update count
        const post = await apiReq('GET', `/api/posts/${currentPostDetailId}`);
        $('pd-like-count').textContent = post.likes_count || 0;
    } catch (err) {
        console.error(err);
    }
}

async function togglePostSave() {
    if (!currentPostDetailId || !currentUser) return;
    try {
        const res = await apiReq('POST', `/api/posts/${currentPostDetailId}/save`);
        $('pd-save-btn').style.color = res.saved ? 'var(--accent)' : '#fff';
    } catch (err) {
        console.error(err);
    }
}

async function submitPostComment() {
    if (!currentPostDetailId || !currentUser) return;
    const input = $('pd-comment-input');
    const content = input.value.trim();
    if (!content) return;
    
    try {
        await apiReq('POST', `/api/posts/${currentPostDetailId}/comments`, { content });
        input.value = '';
        loadPostComments(currentPostDetailId);
    } catch (err) {
        console.error(err);
    }
}

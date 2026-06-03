const fs = require('fs');
const orig = fs.readFileSync('public/app_original.js', 'utf8');

const profileLogic = `
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
        container.innerHTML = \`<div class="upload-area"><span style="font-size:3rem">🔒</span><p>This content is exclusively for fans.</p></div>\`;
        return;
    }
    if (tab === 'gifts') {
        container.innerHTML = \`<div class="upload-area"><span style="font-size:3rem">🎁</span><p>Gift collections coming soon.</p></div>\`;
        return;
    }

    container.innerHTML = '<div class="feed-loading"><div class="spinner"></div></div>';
    
    try {
        const posts = await apiReq('GET', \`/api/posts/user/\${userId}\`);
        
        // Filter based on tab
        let filtered = posts;
        if (tab === 'moments') {
            filtered = posts.filter(p => false); // Moments could be stories or temporary
        }

        if (filtered.length === 0) {
            container.innerHTML = \`<div class="upload-area"><span style="font-size:3rem">📷</span><p>No posts yet.</p></div>\`;
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
            html += \`
                <div class="grid-item" onclick="openPostDetail('\${p.id}')">
                    \${mediaUrl.match(/\\.(mp4|webm)$/i) || p.media_type === 'video' ? 
                        \`<video src="\${toAssetUrl(mediaUrl)}" muted loop></video>\` : 
                        \`<img src="\${toAssetUrl(mediaUrl)}" />\`}
                    <div class="grid-overlay">
                        <span>❤️ \${p.likes_count || 0}</span>
                        <span>💬 \${p.comments_count || 0}</span>
                    </div>
                </div>
            \`;
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

function handlePostMediaSelect(event) {
    const files = event.target.files;
    if (!files.length) return;
    
    cpSelectedFiles = Array.from(files);
    const preview = $('cp-media-preview');
    preview.innerHTML = '';
    preview.classList.remove('hidden');
    
    cpSelectedFiles.forEach(file => {
        const item = document.createElement('div');
        item.className = 'media-preview-item';
        const url = URL.createObjectURL(file);
        if (file.type.startsWith('video/')) {
            item.innerHTML = \`<video src="\${url}" muted autoplay loop></video>\`;
        } else {
            item.innerHTML = \`<img src="\${url}" />\`;
        }
        preview.appendChild(item);
    });
    
    $('cp-next-1').disabled = false;
}
`;

const currApp = fs.readFileSync('public/app.js', 'utf8');

const index = currApp.indexOf('function nextPostStep(step) {');
const restOfApp = currApp.substring(index);

const finalApp = orig + '\n' + profileLogic + '\n' + restOfApp;
fs.writeFileSync('public/app.js', finalApp);
console.log('App.js fixed!');

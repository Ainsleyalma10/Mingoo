const fs = require('fs');

const appOriginal = fs.readFileSync('public/app.js', 'utf8');

const missingLogic = `
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
        const posts = await apiReq('GET', \`/api/posts/user/\${userId}\`);
        
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
            const isVideo = mediaUrl.match(/\\.mp4|\\.webm/i) || p.media_type === 'video';
            html += '<div class="grid-item" onclick="openPostDetail(\\'' + p.id + '\\')">';
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
            item.innerHTML = '<video src="' + url + '" muted autoplay loop></video>';
        } else {
            item.innerHTML = '<img src="' + url + '" />';
        }
        preview.appendChild(item);
    });
    
    $('cp-next-1').disabled = false;
}

function nextPostStep(step) {
    document.querySelectorAll('.cp-step').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.cp-step').forEach(el => el.classList.remove('active'));
    $(\`cp-step-\${step}\`).classList.remove('hidden');
    $(\`cp-step-\${step}\`).classList.add('active');
}
`;

let safeRest = fs.readFileSync('safe_rest.js', 'utf8');

const correctSubmitPost = `
async function submitPost() {
    if (!cpSelectedFiles.length) return;

    $('cp-upload-progress').classList.remove('hidden');
    
    try {
        const mediaData = new FormData();
        mediaData.append('media', cpSelectedFiles[0]);
        
        const uploadRes = await fetch(\`\${API}/api/upload\`, {
            method: 'POST',
            headers: { 'Authorization': \`Bearer \${token}\` },
            body: mediaData
        });
        const uploadJson = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadJson.error || 'Failed to upload media');
        
        const rawHashtags = $('cp-hashtags').value;
        const hashtags = rawHashtags.split(',').map(t => t.trim().replace(/^#/, '')).filter(t => t);
        
        const postPayload = {
            caption: $('cp-caption').value.trim(),
            location: $('cp-location').value.trim(),
            hashtags: hashtags,
            media_url: uploadJson.url,
            media_type: uploadJson.type
        };

        await apiReq('POST', '/api/posts', postPayload);
        
        closeModal('create-post-modal');
        renderProfile(); // refresh posts
    } catch (err) {
        alert("Failed to create post: " + err.message);
    }
}
`;

const detailIndex = safeRest.indexOf('let currentPostDetailId = null;');
const restAfterSubmitPost = safeRest.substring(detailIndex);

const oldCode = "        if (post.media_urls && post.media_urls.length > 0) {\n" +
                "            // For simplicity just showing first media\n" +
                "            const url = post.media_urls[0];\n" +
                "            if (url.match(/\\.(mp4|webm)$/i)) {";

const newCode = "        if (post.media_url) {\n" +
                "            const url = post.media_url;\n" +
                "            if (url.match(/\\.mp4|\\.webm/i) || post.media_type === 'video') {";

const detailFixed = restAfterSubmitPost.replace(oldCode, newCode);

const finalApp = [appOriginal, missingLogic, correctSubmitPost, detailFixed].join('\n');

fs.writeFileSync('public/app.js', finalApp);
console.log('App successfully rebuilt from scratch!');

async function submitPost() {
    if (!cpSelectedFiles.length) return;

    $('cp-upload-progress').classList.remove('hidden');
    
    const formData = new FormData();
    cpSelectedFiles.forEach(f => formData.append('media', f));
    formData.append('caption', $('cp-caption').value.trim());
    formData.append('location', $('cp-location').value.trim());
    
    const rawHashtags = $('cp-hashtags').value;
    const hashtags = rawHashtags.split(',').map(t => t.trim().replace(/^#/, '')).filter(t => t);
    formData.append('hashtags', JSON.stringify(hashtags));

    try {
        const res = await fetch(`${API}/api/posts`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        
        closeModal('create-post-modal');
        renderProfile(); // refresh posts
    } catch (err) {
        alert("Failed to create post: " + err.message);
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
        if (post.media_urls && post.media_urls.length > 0) {
            // For simplicity just showing first media
            const url = post.media_urls[0];
            if (url.match(/\.(mp4|webm)$/i)) {
                mediaHtml = `<video src="${toAssetUrl(url)}" controls autoplay loop></video>`;
            } else {
                mediaHtml = `<img src="${toAssetUrl(url)}" />`;
            }
        }
        $('pd-media-container').innerHTML = mediaHtml;
        
        $('pd-author-name').textContent = post.author_name || 'Username';
        setAvatar($('pd-author-avatar'), post.author_avatar, post.author_name);
        $('pd-caption').textContent = post.caption || '';
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

    } catch (err) {
        console.error(err);
        $('pd-media-container').innerHTML = '<p>Error loading post.</p>';
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

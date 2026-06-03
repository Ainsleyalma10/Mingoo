const express = require('express');
const router = express.Router();
const { db } = require('../config/db');
const { protect } = require('../middlewares/auth');

// 1. Create a Post
router.post('/', protect, async (req, res) => {
  const { caption, media_type, media_url, location, hashtags } = req.body;

  try {
    const { data: post, error } = await db
      .from('posts')
      .insert([
        {
          user_id: req.user.id,
          username: req.user.username,
          caption,
          media_type,
          media_url,
          location,
          visibility: 'public'
        }
      ])
      .select()
      .single();

    if (error) throw error;

    if (hashtags && hashtags.length > 0) {
      const hashtagInserts = hashtags.map(tag => ({
        post_id: post.id,
        hashtag: tag
      }));
      await db.from('post_hashtags').insert(hashtagInserts);
    }

    res.status(201).json(post);
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// 2. Get User's Posts (For Profile)
router.get('/user/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const { data: posts, error } = await db
      .from('posts')
      .select(`
        *,
        post_likes(count),
        post_comments(count)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(posts);
  } catch (error) {
    console.error('Fetch posts error:', error);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// 3. Like a Post
router.post('/:postId/like', protect, async (req, res) => {
  const { postId } = req.params;
  try {
    const { data: existing, error: checkError } = await db
      .from('post_likes')
      .select('*')
      .eq('post_id', postId)
      .eq('user_id', req.user.id)
      .single();

    if (existing) {
      await db.from('post_likes').delete().eq('post_id', postId).eq('user_id', req.user.id);
      return res.json({ liked: false });
    } else {
      await db.from('post_likes').insert([{ post_id: postId, user_id: req.user.id }]);
      return res.json({ liked: true });
    }
  } catch (error) {
    console.error('Like error:', error);
    res.status(500).json({ error: 'Failed to toggle like' });
  }
});

// 4. Save a Post
router.post('/:postId/save', protect, async (req, res) => {
  const { postId } = req.params;
  try {
    const { data: existing } = await db
      .from('post_saves')
      .select('*')
      .eq('post_id', postId)
      .eq('user_id', req.user.id)
      .single();

    if (existing) {
      await db.from('post_saves').delete().eq('post_id', postId).eq('user_id', req.user.id);
      return res.json({ saved: false });
    } else {
      await db.from('post_saves').insert([{ post_id: postId, user_id: req.user.id }]);
      return res.json({ saved: true });
    }
  } catch (error) {
    console.error('Save error:', error);
    res.status(500).json({ error: 'Failed to toggle save' });
  }
});

// 5. Add Comment
router.post('/:postId/comments', protect, async (req, res) => {
  const { postId } = req.params;
  const { content } = req.body;
  try {
    const { data, error } = await db
      .from('post_comments')
      .insert([{ post_id: postId, user_id: req.user.id, comment: content }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('Comment error:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// 6. Get Single Post
router.get('/:postId', async (req, res) => {
  const { postId } = req.params;
  try {
    const { data: post, error } = await db
      .from('posts')
      .select(`
        *,
        users ( username, avatar )
      `)
      .eq('id', postId)
      .single();

    if (error) throw error;
    if (!post) return res.status(404).json({ error: 'Post not found' });

    // Fetch counts separately to avoid complex joins
    const [{ count: likes_count }, { count: comments_count }] = await Promise.all([
      db.from('post_likes').select('*', { count: 'exact', head: true }).eq('post_id', postId),
      db.from('post_comments').select('*', { count: 'exact', head: true }).eq('post_id', postId)
    ]);

    // Format author details for frontend
    const formattedPost = {
      ...post,
      author_name: post.users?.username,
      author_avatar: post.users?.avatar,
      likes_count: likes_count || 0,
      comments_count: comments_count || 0
    };

    res.json(formattedPost);
  } catch (error) {
    console.error('Fetch post error:', error);
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

// 7. Get Post Status (Liked / Saved)
router.get('/:postId/status', protect, async (req, res) => {
  const { postId } = req.params;
  try {
    const [{ data: liked }, { data: saved }] = await Promise.all([
      db.from('post_likes').select('*').eq('post_id', postId).eq('user_id', req.user.id).single(),
      db.from('post_saves').select('*').eq('post_id', postId).eq('user_id', req.user.id).single()
    ]);
    
    res.json({
      liked: !!liked,
      saved: !!saved
    });
  } catch (error) {
    res.json({ liked: false, saved: false });
  }
});

// 8. Get Post Comments
router.get('/:postId/comments', async (req, res) => {
  const { postId } = req.params;
  try {
    const { data: comments, error } = await db
      .from('post_comments')
      .select(`
        *,
        users ( username, avatar )
      `)
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    
    const formattedComments = comments.map(c => ({
      ...c,
      content: c.comment,
      author_name: c.users?.username,
      author_avatar: c.users?.avatar
    }));

    res.json(formattedComments);
  } catch (error) {
    console.error('Fetch comments error:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// 9. Delete a Post
router.delete('/:postId', protect, async (req, res) => {
  const { postId } = req.params;
  try {
    // 1. Fetch post to verify ownership
    const { data: post, error: fetchError } = await db
      .from('posts')
      .select('*')
      .eq('id', postId)
      .single();

    if (fetchError) throw fetchError;
    if (!post) return res.status(404).json({ message: 'Post not found' });

    // 2. Check if user is the author
    if (String(post.user_id) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Unauthorized to delete this post' });
    }

    // 3. Delete the post itself (database ON DELETE CASCADE handles referencing tables automatically)
    const { error: deleteError } = await db
      .from('posts')
      .delete()
      .eq('id', postId);

    if (deleteError) throw deleteError;

    res.json({ success: true, message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ message: error.message || 'Failed to delete post' });
  }
});

module.exports = router;

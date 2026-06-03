const express = require('express');
const router = express.Router();
const multer = require('multer');
const { put } = require('@vercel/blob');
const { protect } = require('../middlewares/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

router.post('/', protect, upload.single('media'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No media file provided.' });
    }

    const file = req.file;
    const blobName = `posts/${req.user.id}-${Date.now()}-${file.originalname}`;

    const blob = await put(blobName, file.buffer, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN, // In case NEXT_PUBLIC is not picked up by Vercel SDK automatically
      contentType: file.mimetype,
    });

    res.json({
      url: blob.url,
      type: file.mimetype.startsWith('video/') ? 'video' : 'image'
    });
  } catch (error) {
    console.error('Blob upload error:', error);
    res.status(500).json({ error: 'Failed to upload media to blob storage.' });
  }
});

module.exports = router;

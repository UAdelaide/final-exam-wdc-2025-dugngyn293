const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { updateUserProfile } = require('../repositories/userRepo');


// Setup multer storage for avatar upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads'),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}${ext}`);
    }
});
const upload = multer({ storage });

// Route: /api/update-profile
router.post('/update-profile', upload.single('avatar'), async (req, res) => {
    const { username, password } = req.body;
    const avatarUrl = req.file ? `/uploads/${req.file.filename}` : null;

    try {
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Missing username or password.' });
        }

        // ✅ Update MySQL database
        await updateUserProfile(username, password, avatarUrl);

        res.json({
            success: true,
            message: 'Profile updated successfully',
            avatarUrl: avatarUrl
        });
    } catch (err) {
        console.error('❌ Error in update-profile:', err);
        res.status(500).json({
            success: false,
            message: 'Server error: ' + err.message
        });
    }
});

module.exports = router;
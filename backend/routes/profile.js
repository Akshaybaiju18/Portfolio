// routes/profile.js
// Profile management routes with Cloudinary image upload

const express = require('express');
const multer = require('multer');
const router = express.Router();
const Profile = require('../models/Profile');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { cacheMiddleware, invalidateRouteCache } = require('../middleware/cache');

// Configure Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer storage configurations for Cloudinary for images
const imageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'portfolio/profile',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif'],
    transformation: [{ width: 500, height: 500, crop: 'fill' }]
  }
});

// Multer storage for Cloudinary for resumes
const resumeStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'portfolio/resumes',
    allowed_formats: ['pdf', 'doc', 'docx']
  }
});

const imageUpload = multer({ 
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

const resumeUpload = multer({ 
  storage: resumeStorage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// GET /api/profile - Get active profile (PUBLIC)
router.get('/', cacheMiddleware(3600), async (req, res) => {
  try {
    const profile = await Profile.findOne({ isActive: true });
    
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching profile'
    });
  }
});

// GET /api/profile/admin - Get profile for admin editing (ADMIN ONLY)
router.get('/admin', authenticateToken, requireAdmin, async (req, res) => {
  try {
    let profile = await Profile.findOne({ isActive: true });
    
    if (!profile) {
      profile = await Profile.create({
        firstName: 'Your',
        lastName: 'Name',
        title: 'Full Stack Developer',
        tagline: 'Passionate about creating amazing web experiences',
        aboutMe: 'Write about yourself here...',
        email: 'your.email@example.com',
        isActive: true
      });
    }

    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    console.error('Error fetching admin profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching profile'
    });
  }
});

// PUT /api/profile - Update profile (ADMIN ONLY)
router.put('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    let profile = await Profile.findOne({ isActive: true });
    
    if (!profile) {
      profile = new Profile({
        ...req.body,
        isActive: true
      });
    } else {
      Object.assign(profile, req.body);
    }

    await profile.save();

    // Invalidate profile cache
    await invalidateRouteCache('profile');

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: profile
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error updating profile'
    });
  }
});

// POST /api/profile/upload-image - Upload profile image (ADMIN ONLY)
router.post('/upload-image', authenticateToken, requireAdmin, imageUpload.single('profileImage'), async (req, res) => {
  try {
    if (!req.file || !req.file.path) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    const imageUrl = req.file.path; // Cloudinary URL
    
    let profile = await Profile.findOne({ isActive: true });
    
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    profile.profileImage = imageUrl;
    await profile.save();

    // Invalidate profile cache
    await invalidateRouteCache('profile');

    res.json({
      success: true,
      message: 'Profile image uploaded successfully',
      data: {
        imageUrl: imageUrl,
        profile: profile
      }
    });
  } catch (error) {
    console.error('Error uploading profile image:', error);
    res.status(500).json({
      success: false,
      message: 'Server error uploading image'
    });
  }
});

// POST /api/profile/upload-resume - Upload resume (ADMIN ONLY)
router.post('/upload-resume', authenticateToken, requireAdmin, resumeUpload.single('resume'), async (req, res) => {
  try {
    if (!req.file || !req.file.path) {
      return res.status(400).json({
        success: false,
        message: 'No resume file provided'
      });
    }

    const resumeUrl = req.file.path; // Cloudinary URL
    
    let profile = await Profile.findOne({ isActive: true });
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    profile.resumeUrl = resumeUrl;
    await profile.save();

    // Invalidate profile cache
    await invalidateRouteCache('profile');

    res.json({
      success: true,
      message: 'Resume uploaded successfully',
      data: {
        resumeUrl: resumeUrl
      }
    });
  } catch (error) {
    console.error('Error uploading resume:', error);
    res.status(500).json({
      success: false,
      message: 'Server error uploading resume'
    });
  }
});

module.exports = router;

// routes/skills.js
// API routes for managing skills - PROTECTED VERSION

const express = require('express');
const router = express.Router();
const Skill = require('../models/Skill');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { cacheMiddleware, invalidateResourceCache } = require('../middleware/cache');

// GET /api/skills - Get all skills (PUBLIC - for portfolio display)
router.get('/', cacheMiddleware(3600), async (req, res) => {
  try {
    const {
      category,
      level,
      featured,
      status = 'active',
      sort = 'category,sortOrder'
    } = req.query;

    // Build query
    let query = { status };

    if (category) query.category = category;
    if (level) query.level = level;
    if (featured !== undefined) query.featured = featured === 'true';

    // Build sort object
    const sortObj = {};
    sort.split(',').forEach(field => {
      if (field.startsWith('-')) {
        sortObj[field.substring(1)] = -1;
      } else {
        sortObj[field] = 1;
      }
    });

    const skills = await Skill.find(query)
      .sort(sortObj)
      .populate('projects', 'title slug')
      .select('-__v');

    // Group skills by category
    const groupedSkills = skills.reduce((acc, skill) => {
      if (!acc[skill.category]) {
        acc[skill.category] = [];
      }
      acc[skill.category].push(skill);
      return acc;
    }, {});

    res.json({
      success: true,
      count: skills.length,
      data: skills,
      grouped: groupedSkills
    });
  } catch (error) {
    console.error('Error fetching skills:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching skills'
    });
  }
});

// GET /api/skills/categories - Get all skill categories (PUBLIC)
router.get('/categories', cacheMiddleware(7200), async (req, res) => {
  try {
    const categories = await Skill.distinct('category');
    const categoryStats = await Skill.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$category', count: { $sum: 1 }, avgProficiency: { $avg: '$proficiency' } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: categories,
      stats: categoryStats
    });
  } catch (error) {
    console.error('Error fetching skill categories:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching categories'
    });
  }
});

// GET /api/skills/:id - Get single skill (PUBLIC - for admin editing)
router.get('/:id', cacheMiddleware(3600), async (req, res) => {
  try {
    const skill = await Skill.findById(req.params.id)
      .populate('projects', 'title slug shortDescription')
      .select('-__v');

    if (!skill) {
      return res.status(404).json({
        success: false,
        message: 'Skill not found'
      });
    }

    res.json({
      success: true,
      data: skill
    });
  } catch (error) {
    console.error('Error fetching skill:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching skill'
    });
  }
});

// 🔒 PROTECTED ROUTES - Admin only from here

// POST /api/skills - Create new skill (ADMIN ONLY)
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const skill = new Skill(req.body);
    await skill.save();

    // Invalidate skills cache
    await invalidateResourceCache('skills');

    res.status(201).json({
      success: true,
      message: 'Skill created successfully',
      data: skill
    });
  } catch (error) {
    console.error('Error creating skill:', error);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Skill with this name already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error creating skill'
    });
  }
});

// PUT /api/skills/:id - Update skill (ADMIN ONLY)
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const skill = await Skill.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!skill) {
      return res.status(404).json({
        success: false,
        message: 'Skill not found'
      });
    }

    // Invalidate skills cache
    await invalidateResourceCache('skills');

    res.json({
      success: true,
      message: 'Skill updated successfully',
      data: skill
    });
  } catch (error) {
    console.error('Error updating skill:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating skill'
    });
  }
});

// DELETE /api/skills/:id - Delete skill (ADMIN ONLY)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const skill = await Skill.findByIdAndDelete(req.params.id);

    if (!skill) {
      return res.status(404).json({
        success: false,
        message: 'Skill not found'
      });
    }

    // Invalidate skills cache
    await invalidateResourceCache('skills');

    res.json({
      success: true,
      message: 'Skill deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting skill:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting skill'
    });
  }
});

module.exports = router;

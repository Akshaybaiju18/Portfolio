// routes/projects.js
// API routes for managing projects - COMPLETE FIXED VERSION

const express = require('express');
const router = express.Router();
const Project = require('../models/Project');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { cacheMiddleware, invalidateResourceCache } = require('../middleware/cache');

// Helper function to create slug
const createSlug = (title) => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
};

// GET /api/projects - Get projects (PUBLIC + ADMIN)
router.get('/', cacheMiddleware(3600), async (req, res) => {
  try {
    console.log('🔍 Projects GET - Query params:', req.query);
    
    const { status, featured } = req.query;

    // Build query
    let query = {};
    
    // Handle status filtering
    if (status) {
      if (status === 'all') {
        // Don't add status filter - get everything (for admin)
        console.log('🔍 Getting ALL projects (admin view)');
      } else {
        // Filter by specific status
        query.status = status;
        console.log('🔍 Filtering by status:', status);
      }
    } else {
      // Default behavior - get published only (for public)
      query.status = 'published';
      console.log('🔍 Default: getting published projects only');
    }
    
    if (featured !== undefined) {
      query.featured = featured === 'true';
      console.log('🔍 Filtering by featured:', featured);
    }

    console.log('🔍 Final query:', query);

    const projects = await Project.find(query)
      .sort({ sortOrder: 1, createdAt: -1 })
      .select('-__v');

    console.log('🔍 Found', projects.length, 'projects');

    res.json({
      success: true,
      count: projects.length,
      data: projects
    });
  } catch (error) {
    console.error('❌ Error fetching projects:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching projects'
    });
  }
});

// GET /api/projects/:identifier - Get single project by slug or ID
router.get('/:identifier', cacheMiddleware(3600), async (req, res) => {
  try {
    const { identifier } = req.params;
    
    let project;
    if (identifier.match(/^[0-9a-fA-F]{24}$/)) {
      // It's a MongoDB ObjectId (for admin editing)
      project = await Project.findById(identifier).select('-__v');
    } else {
      // It's a slug (for public viewing)
      project = await Project.findOne({
        slug: identifier,
        status: 'published'
      }).select('-__v');
    }

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    res.json({
      success: true,
      data: project
    });
  } catch (error) {
    console.error('❌ Error fetching project:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching project'
    });
  }
});

// 🔒 PROTECTED ROUTES - Admin only

// POST /api/projects - Create new project (ADMIN ONLY)
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('🔍 Creating project:', req.body.title);
    
    // Generate slug from title
    const baseSlug = createSlug(req.body.title);
    
    // Check if slug already exists and create unique one
    let slug = baseSlug;
    let counter = 1;
    
    while (await Project.findOne({ slug })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    const projectData = {
      ...req.body,
      slug
    };

    const project = new Project(projectData);
    await project.save();

    // Invalidate projects cache
    await invalidateResourceCache('projects');

    console.log('✅ Project created:', project.title, 'with slug:', project.slug);

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      data: project
    });
  } catch (error) {
    console.error('❌ Error creating project:', error);

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
      message: 'Server error creating project'
    });
  }
});

// PUT /api/projects/:id - Update project (ADMIN ONLY)
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('🔍 Updating project:', req.params.id);
    
    // If title changed, update slug
    if (req.body.title) {
      const newSlug = createSlug(req.body.title);
      
      // Check if new slug conflicts with other projects
      const existingProject = await Project.findOne({ 
        slug: newSlug, 
        _id: { $ne: req.params.id } 
      });
      
      if (!existingProject) {
        req.body.slug = newSlug;
      }
    }

    const project = await Project.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Invalidate projects cache
    await invalidateResourceCache('projects');

    console.log('✅ Project updated:', project.title);

    res.json({
      success: true,
      message: 'Project updated successfully',
      data: project
    });
  } catch (error) {
    console.error('❌ Error updating project:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating project'
    });
  }
});

// DELETE /api/projects/:id - Delete project (ADMIN ONLY)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const project = await Project.findByIdAndDelete(req.params.id);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Invalidate projects cache
    await invalidateResourceCache('projects');

    console.log('✅ Project deleted:', project.title);

    res.json({
      success: true,
      message: 'Project deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting project:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting project'
    });
  }
});

module.exports = router;

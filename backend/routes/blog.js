// routes/blog.js
// API routes for managing blog posts - COMPLETE FIXED VERSION

const express = require('express');
const router = express.Router();
const BlogPost = require('../models/BlogPost');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { cacheMiddleware, invalidateResourceCache } = require('../middleware/cache');

// Helper function to create slug
const createSlug = (title) => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
};

// GET /api/blog - Get all blog posts (PUBLIC + ADMIN)
router.get('/', cacheMiddleware(3600), async (req, res) => {
  try {
    console.log('🔍 Blog GET - Query params:', req.query);
    
    const {
      status,
      category,
      tag,
      featured,
      limit = 10,
      page = 1,
      sort = '-createdAt'
    } = req.query;

    // Build query
    let query = {};

    // Handle status filtering
    if (status) {
      if (status === 'all') {
        // Don't add status filter - get everything (for admin)
        console.log('🔍 Getting ALL blog posts (admin view)');
      } else {
        // Filter by specific status
        query.status = status;
        console.log('🔍 Filtering by status:', status);
        
        // Only include published posts with valid publish date
        if (status === 'published') {
          query.publishedAt = { $lte: new Date() };
        }
      }
    } else {
      // Default behavior - get published only (for public)
      query.status = 'published';
      query.publishedAt = { $lte: new Date() };
      console.log('🔍 Default: getting published blog posts only');
    }
    
    if (category) query.category = category;
    if (tag) query.tags = { $in: [tag] };
    if (featured !== undefined) query.featured = featured === 'true';

    console.log('🔍 Final query:', query);

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const posts = await BlogPost.find(query)
      .sort(sort)
      .limit(parseInt(limit))
      .skip(skip)
      .select('title slug excerpt author featuredImage category tags publishedAt readTime views likes featured status createdAt')
      .populate('relatedPosts', 'title slug excerpt featuredImage');

    const total = await BlogPost.countDocuments(query);
    const totalPages = Math.ceil(total / parseInt(limit));

    console.log('🔍 Found', posts.length, 'blog posts');

    res.json({
      success: true,
      count: posts.length,
      total,
      totalPages,
      currentPage: parseInt(page),
      data: posts
    });
  } catch (error) {
    console.error('❌ Error fetching blog posts:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching blog posts'
    });
  }
});

// GET /api/blog/categories - Get all blog categories
router.get('/categories', cacheMiddleware(7200), async (req, res) => {
  try {
    const categories = await BlogPost.distinct('category');
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('❌ Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching categories'
    });
  }
});

// GET /api/blog/tags - Get all blog tags
router.get('/tags', cacheMiddleware(7200), async (req, res) => {
  try {
    const tags = await BlogPost.aggregate([
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: tags.map(tag => ({ name: tag._id, count: tag.count }))
    });
  } catch (error) {
    console.error('❌ Error fetching tags:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching tags'
    });
  }
});

// GET /api/blog/:identifier - Get single blog post by slug or ID
router.get('/:identifier', cacheMiddleware(3600), async (req, res) => {
  try {
    const { identifier } = req.params;
    
    let post;
    if (identifier.match(/^[0-9a-fA-F]{24}$/)) {
      // It's a MongoDB ObjectId (for admin editing)
      post = await BlogPost.findById(identifier)
        .populate('relatedPosts', 'title slug excerpt featuredImage publishedAt readTime')
        .select('-__v');
    } else {
      // It's a slug (for public viewing)
      post = await BlogPost.findOne({
        slug: identifier,
        status: 'published'
      })
      .populate('relatedPosts', 'title slug excerpt featuredImage publishedAt readTime')
      .select('-__v');
      
      // Increment view count for published posts only
      if (post) {
        post.views += 1;
        await post.save();
      }
    }

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    res.json({
      success: true,
      data: post
    });
  } catch (error) {
    console.error('❌ Error fetching blog post:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching blog post'
    });
  }
});

// 🔒 PROTECTED ROUTES - Admin only

// POST /api/blog - Create new blog post (ADMIN ONLY)
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('🔍 Creating blog post:', req.body.title);
    
    // Generate slug from title
    const baseSlug = createSlug(req.body.title);
    
    // Check if slug already exists and create unique one
    let slug = baseSlug;
    let counter = 1;
    
    while (await BlogPost.findOne({ slug })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    const postData = {
      ...req.body,
      slug
    };

    const post = new BlogPost(postData);
    await post.save();

    // Invalidate blog cache
    await invalidateResourceCache('blog');

    console.log('✅ Blog post created:', post.title, 'with slug:', post.slug);

    res.status(201).json({
      success: true,
      message: 'Blog post created successfully',
      data: post
    });
  } catch (error) {
    console.error('❌ Error creating blog post:', error);

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
      message: 'Server error creating blog post'
    });
  }
});

// PUT /api/blog/:id - Update blog post (ADMIN ONLY)
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('🔍 Updating blog post:', req.params.id);
    
    // If title changed, update slug
    if (req.body.title) {
      const newSlug = createSlug(req.body.title);
      
      // Check if new slug conflicts with other posts
      const existingPost = await BlogPost.findOne({ 
        slug: newSlug, 
        _id: { $ne: req.params.id } 
      });
      
      if (!existingPost) {
        req.body.slug = newSlug;
      }
    }

    const post = await BlogPost.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    // Invalidate blog cache
    await invalidateResourceCache('blog');

    console.log('✅ Blog post updated:', post.title);

    res.json({
      success: true,
      message: 'Blog post updated successfully',
      data: post
    });
  } catch (error) {
    console.error('❌ Error updating blog post:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating blog post'
    });
  }
});

// DELETE /api/blog/:id - Delete blog post (ADMIN ONLY)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const post = await BlogPost.findByIdAndDelete(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    // Invalidate blog cache
    await invalidateResourceCache('blog');

    console.log('✅ Blog post deleted:', post.title);

    res.json({
      success: true,
      message: 'Blog post deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting blog post:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting blog post'
    });
  }
});

module.exports = router;

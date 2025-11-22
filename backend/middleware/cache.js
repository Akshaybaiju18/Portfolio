// Caching middleware for Redis
const { getRedisClient } = require('../utils/redis');

// Default cache TTL (Time To Live) in seconds
const DEFAULT_TTL = 3600; // 1 hour

// Generate cache key from request
const generateCacheKey = (req) => {
  const baseKey = `${req.method}:${req.originalUrl || req.url}`;
  // Include query parameters in cache key
  const queryString = Object.keys(req.query)
    .sort()
    .map(key => `${key}=${req.query[key]}`)
    .join('&');
  return queryString ? `${baseKey}?${queryString}` : baseKey;
};

// Cache middleware for GET requests
const cacheMiddleware = (ttl = DEFAULT_TTL) => {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Skip caching for admin routes (they need fresh data)
    if (req.path.includes('/admin') || req.user) {
      return next();
    }

    const redisClient = getRedisClient();
    
    // If Redis is not available, skip caching
    if (!redisClient) {
      return next();
    }

    try {
      const cacheKey = generateCacheKey(req);
      
      // Try to get data from cache
      const cachedData = await redisClient.get(cacheKey);
      
      if (cachedData) {
        console.log(`✅ Cache HIT: ${cacheKey}`);
        const parsedData = JSON.parse(cachedData);
        return res.json(parsedData);
      }

      // Cache miss - continue to route handler
      console.log(`❌ Cache MISS: ${cacheKey}`);
      
      // Store original json method
      const originalJson = res.json.bind(res);
      
      // Override json method to cache response
      res.json = function(data) {
        // Cache the response
        if (redisClient && data.success !== false) {
          redisClient.setEx(cacheKey, ttl, JSON.stringify(data))
            .catch(err => console.error('❌ Redis set error:', err));
        }
        
        // Send response
        return originalJson(data);
      };
      
      next();
    } catch (error) {
      console.error('❌ Cache middleware error:', error);
      // If caching fails, continue without cache
      next();
    }
  };
};

// Invalidate cache by pattern
const invalidateCache = async (pattern) => {
  const redisClient = getRedisClient();
  
  if (!redisClient) {
    return;
  }

  try {
    // Find all keys matching the pattern
    const keys = await redisClient.keys(pattern);
    
    if (keys.length > 0) {
      await redisClient.del(keys);
      console.log(`🗑️  Cache invalidated: ${keys.length} keys matching "${pattern}"`);
    }
  } catch (error) {
    console.error('❌ Cache invalidation error:', error);
  }
};

// Invalidate cache for specific routes
const invalidateRouteCache = async (route) => {
  // Invalidate all GET requests for this route
  await invalidateCache(`GET:/api/${route}*`);
};

// Invalidate all cache for a resource (e.g., projects, blog, skills)
const invalidateResourceCache = async (resource) => {
  await invalidateRouteCache(resource);
  // Also invalidate related routes
  if (resource === 'blog') {
    await invalidateRouteCache('blog/categories');
    await invalidateRouteCache('blog/tags');
  }
  if (resource === 'skills') {
    await invalidateRouteCache('skills/categories');
  }
};

module.exports = {
  cacheMiddleware,
  invalidateCache,
  invalidateRouteCache,
  invalidateResourceCache,
  DEFAULT_TTL
};


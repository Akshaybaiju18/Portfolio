// Redis connection utility
const redis = require('redis');
require('dotenv').config();

let redisClient = null;

// Create Redis client
const createRedisClient = async () => {
  try {
    // Redis connection configuration
    // Support both Redis Cloud (with URL) and local Redis
    const redisConfig = {
      url: process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
      password: process.env.REDIS_PASSWORD || undefined,
      database: process.env.REDIS_DB || 0,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('!! Redis: Too many reconnection attempts');
            return new Error('Too many retries');
          }
          return Math.min(retries * 100, 3000);
        }
      }
    };

    redisClient = redis.createClient(redisConfig);

    redisClient.on('error', (err) => {
      console.error('!!! Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      console.log('🔄 Redis: Connecting...');
    });

    redisClient.on('ready', () => {
      console.log('✅ Redis: Connected and ready');
    });

    redisClient.on('reconnecting', () => {
      console.log('🔄 Redis: Reconnecting...');
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    console.error('!! Redis connection failed:', error.message);
    return null;
  }
};

// Get Redis client
const getRedisClient = () => {
  return redisClient;
};

// Initialize Redis connection
const initRedis = async () => {
  if (!redisClient) {
    redisClient = await createRedisClient();
  }
  return redisClient;
};

// Close Redis connection
const closeRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log(' Redis: Connection closed');
  }
};

module.exports = {
  initRedis,
  getRedisClient,
  closeRedis
};


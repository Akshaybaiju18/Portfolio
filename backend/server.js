const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const projectRoutes = require('./routes/projects');
const skillRoutes = require('./routes/skills');
const blogRoutes = require('./routes/blog');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const profileRoutes = require('./routes/profile');
const { initRedis } = require('./utils/redis');

const app = express();
const PORT = process.env.PORT || 5000;

// Setup CORS origins from env variable FRONTEND_ORIGIN (comma separated values)
const allowedOrigins = process.env.FRONTEND_ORIGIN
  ? process.env.FRONTEND_ORIGIN.split(',').map(origin => origin.trim())
  : ['http://localhost:3000'];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

app.use(express.json());

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https://res.cloudinary.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      connectSrc: ["'self'"],
    }
  }
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use('/api', limiter);

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📊 Database: ${conn.connection.name}`);
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
};

app.use('/api/projects', projectRoutes);
app.use('/api/skills', skillRoutes);
app.use('/api/blog', blogRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/contact', require('./routes/contact'));

app.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Portfolio CMS API is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    storage: 'Cloudinary',
  });
});

const startServer = async () => {
  await connectDB();
  
  // Initialize Redis connection
  await initRedis();
  
  app.listen(PORT, () => {
    console.log('🚀=================================🚀');
    console.log(`🎯 Portfolio CMS Backend Server`);
    console.log(`📡 Server running on port: ${PORT}`);
    console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
    console.log(`☁️ Storage: Cloudinary`);
    console.log(`💾 Cache: Redis`);
    console.log('🚀=================================🚀');
  });
};

startServer();

module.exports = app;

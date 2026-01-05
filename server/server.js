require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

// 连接数据库
connectDB();

const app = express();

const corsOptions = {
  origin: function (origin, callback) {
    const defaultOrigins = [
      'https://dashboard.lingkuma.org',
      'https://db.chikai.de',
      'https://eve.rrfr.de',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://192.168.0.171:3000',
      'chrome-extension://*'
    ];

    const corsOrigins = process.env.CORS_ORIGINS;

    if (corsOrigins === '*') {
      callback(null, true);
    } else if (corsOrigins) {
      const customOrigins = corsOrigins.split(',').map(o => o.trim());
      const allOrigins = [...defaultOrigins, ...customOrigins];
      if (!origin || allOrigins.includes(origin) || origin.match(/^[a-z]+-extension:\/\//)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    } else {
      if (!origin || defaultOrigins.includes(origin) || origin.match(/^[a-z]+-extension:\/\//)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-server-signature', 'x-server-timestamp', 'x-server-id']
};

app.use(cors(corsOptions));

// 增加请求体大小限制到 50MB（用于批量上传单词数据）
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 请求日志中间件
// app.use((req, res, next) => {
//   const timestamp = new Date().toISOString();
//   console.log(`[${timestamp}] ${req.method} ${req.path}`);
//   if (req.method !== 'GET' && req.body && Object.keys(req.body).length > 0) {
//     console.log(`  Body:`, JSON.stringify(req.body, null, 2));
//   }
//   next();
// });

app.use((req, res, next) => {
  if (req.path.endsWith('.html')) {
    return res.status(404).json({
      success: false,
      message: 'Route not found'
    });
  }
  next();
});

app.use('/dashboard', express.static('dashboard', { extensions: ['html'] }));

// 路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/config', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/words', require('./routes/words'));
app.use('/api/phrases', require('./routes/phrases'));
app.use('/api/server-sync', require('./routes/serverSync'));

// 健康检查
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Lingkuma Cloud Server is running',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Lingkuma Cloud Server is running',
    timestamp: new Date().toISOString()
  });
});

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// 错误处理
app.use((err, req, res, next) => {
  // console.error('Server error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  // console.log(`\n🚀 Lingkuma Cloud Server is running on port ${PORT}`);
  // console.log(`📍 Health check: http://localhost:${PORT}/health`);
  // console.log(`📍 API base URL: http://localhost:${PORT}/api`);
  // console.log(`📍 LAN access: http://192.168.0.171:${PORT}`);
});


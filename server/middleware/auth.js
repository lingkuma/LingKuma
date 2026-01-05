const jwt = require('jsonwebtoken');
const User = require('../models/User');

// 验证 JWT Token
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // 获取 token
      token = req.headers.authorization.split(' ')[1];

      // 验证 token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 获取用户信息（不包含密码）- 使用 username 查找
      req.user = await User.findOne({ username: decoded.username }).select('-password');

      if (!req.user) {
        return res.status(401).json({ message: '用户不存在' });
      }

      next();
    } catch (error) {
      // console.error('Token 验证失败:', error);
      return res.status(401).json({ message: 'Token 无效或已过期' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: '未提供认证 Token' });
  }
};

// 验证订阅状态
const checkSubscription = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: '未认证' });
    }

    // 自建服务器用户跳过订阅检查
    if (req.user.isSelfHosted) {
      return next();
    }

    // 检查订阅是否有效（仅官方服务器用户）
    if (!req.user.isSubscriptionValid()) {
      // 订阅已过期
      req.user.subscriptionStatus = 'expired';
      await req.user.save();

      return res.status(403).json({
        message: '订阅已过期，请续费后继续使用',
        subscriptionExpired: true,
        expireAt: req.user.subscriptionExpireAt
      });
    }

    // 订阅有效，继续
    next();
  } catch (error) {
    // console.error('订阅验证失败:', error);
    return res.status(500).json({ message: '服务器错误' });
  }
};

// 生成 JWT Token
const generateToken = (username) => {
  return jwt.sign({ username }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

module.exports = { protect, checkSubscription, generateToken };


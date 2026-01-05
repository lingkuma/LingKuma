const jwt = require('jsonwebtoken');

const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || 'admin-session-secret-key-change-in-production';
const SESSION_EXPIRY = '24h';

const activeSessions = new Map();

const generateAdminToken = () => {
  const sessionId = Date.now().toString() + Math.random().toString(36).substring(2);
  const token = jwt.sign(
    { sessionId, role: 'admin' },
    ADMIN_SESSION_SECRET,
    { expiresIn: SESSION_EXPIRY }
  );
  
  activeSessions.set(sessionId, {
    createdAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000
  });
  
  return token;
};

const verifyAdminSession = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: '未提供管理员认证令牌'
    });
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = jwt.verify(token, ADMIN_SESSION_SECRET);
    
    if (!decoded.sessionId || !activeSessions.has(decoded.sessionId)) {
      return res.status(401).json({
        success: false,
        message: '会话已过期或无效'
      });
    }
    
    const session = activeSessions.get(decoded.sessionId);
    
    if (Date.now() > session.expiresAt) {
      activeSessions.delete(decoded.sessionId);
      return res.status(401).json({
        success: false,
        message: '会话已过期'
      });
    }
    
    req.adminSession = decoded;
    next();
  } catch (error) {
    console.error('Admin session verification error:', error);
    return res.status(401).json({
      success: false,
      message: '无效的认证令牌'
    });
  }
};

const invalidateAdminSession = (token) => {
  try {
    const decoded = jwt.verify(token, ADMIN_SESSION_SECRET);
    if (decoded.sessionId) {
      activeSessions.delete(decoded.sessionId);
      return true;
    }
  } catch (error) {
    console.error('Invalidate session error:', error);
  }
  return false;
};

const cleanupExpiredSessions = () => {
  const now = Date.now();
  for (const [sessionId, session] of activeSessions.entries()) {
    if (now > session.expiresAt) {
      activeSessions.delete(sessionId);
    }
  }
};

setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

module.exports = {
  generateAdminToken,
  verifyAdminSession,
  invalidateAdminSession
};

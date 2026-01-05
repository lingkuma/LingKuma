const express = require('express');
const router = express.Router();
const User = require('../models/User');
const DataServer = require('../models/DataServer');
const Word = require('../models/Word');
const { generateToken, protect } = require('../middleware/auth');
const { syncUserToServer, syncUserConfigToServer } = require('../utils/serverSync');
const crypto = require('crypto');

const AFDIAN_CONFIG = {
  clientId: process.env.AFDIAN_CLIENT_ID,
  clientSecret: process.env.AFDIAN_CLIENT_SECRET,
  authDomain: 'https://afdian.com',
  apiDomain: 'https://afdian.com/api',
  redirectUri: process.env.AFDIAN_REDIRECT_URI
};

// 辅助函数：检测是否为浏览器扩展URL（支持chrome、moz、webkit等协议）
function isExtensionUrl(url) {
  if (!url) return false;
  try {
    const match = url.match(/^([^:]+):\/\//);
    if (!match) return false;
    const protocol = match[1].toLowerCase();
    return protocol.endsWith('-extension');
  } catch (error) {
    return false;
  }
}

// @route   GET /api/config/register-mode
// @desc    Get current register mode configuration
// @access  Public
router.get('/register-mode', async (req, res) => {
  try {
    const registerMode = process.env.REGISTER_MODE || 'localhost';
    res.status(200).json({
      success: true,
      registerMode
    });
  } catch (error) {
    // console.error('Get register mode error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, afdianUserId, dataServer } = req.body;
    const registerMode = process.env.REGISTER_MODE || 'localhost';

    if (registerMode === 'afdian') {
      return res.status(403).json({
        success: false,
        message: 'Registration is only available through Afdian OAuth login'
      });
    }

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide username, email and password'
      });
    }

    const userExists = await User.findOne({ $or: [{ email }, { username }] });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }

    let user;
    let subscriptionExpireAt;
    let subscriptionStatus;
    let selectedServer = null;
    let planName = '';

    if (dataServer) {
      selectedServer = await DataServer.findById(dataServer);
      if (!selectedServer) {
        return res.status(400).json({
          success: false,
          message: 'Invalid data server'
        });
      }
      if (!selectedServer.available || selectedServer.status !== 'active') {
        return res.status(400).json({
          success: false,
          message: 'Selected server is not available'
        });
      }
      if (selectedServer.userCount >= selectedServer.maxUsers) {
        return res.status(400).json({
          success: false,
          message: 'Selected server has reached maximum capacity'
        });
      }
    }

    if (registerMode === 'localhost') {
      subscriptionExpireAt = new Date('9999-09-09');
      subscriptionStatus = 'localhost';
      planName = 'localhost';

      user = await User.create({
        username,
        email,
        password,
        isSelfHosted: true,
        subscriptionStatus,
        subscriptionExpireAt,
        afdianUserId: afdianUserId || '',
        dataServer: selectedServer ? selectedServer.url : '',
        afdianPlanName: planName,
        wordLimit: 100000
      });

      if (selectedServer) {
        await selectedServer.incrementUserCount();
      }
    } else if (registerMode === 'afdian') {
      if (!afdianUserId) {
        return res.status(400).json({
          success: false,
          message: 'Afdian user ID is required for registration'
        });
      }

      const afdianApiUrl = `https://api.lingkuma.org/api/auth/afdian/getPlans?user_id=${afdianUserId}`;

      let afdianResponse;
      try {
        const response = await fetch(afdianApiUrl);
        afdianResponse = await response.json();
      } catch (fetchError) {
        // console.error('Afdian API fetch error:', fetchError);
        return res.status(500).json({
          success: false,
          message: 'Failed to connect to Afdian API',
          error: fetchError.message
        });
      }

      if (!afdianResponse.success || !afdianResponse.plan_name) {
        return res.status(400).json({
          success: false,
          message: 'No active subscription found for this Afdian user ID'
        });
      }

      planName = afdianResponse.plan_name;
      subscriptionExpireAt = new Date(Date.now() + 32 * 24 * 60 * 60 * 1000);
      subscriptionStatus = 'active';

      const planLimits = {
        '贪吃熊_alpha': 20000,
        '胖胖熊_alpha': 40000,
        '肥肥熊_alpha': 60000,
        '田中熊_alpha': 80000,
        '雨多熊_alpha': 333333,
        '誓约熊_alpha': 666666
      };
      const wordLimit = planLimits[planName] || 20000;

      user = await User.create({
        username,
        email,
        password,
        isSelfHosted: false,
        subscriptionStatus,
        subscriptionExpireAt,
        externalSubscription: {
          platform: 'afdian',
          userId: afdianUserId,
          afdianUserId: afdianUserId,
          lastVerified: new Date(),
          lastRefreshTime: new Date()
        },
        afdianUserId: afdianUserId,
        dataServer: selectedServer ? selectedServer.url : '',
        afdianPlanName: planName,
        wordLimit: wordLimit
      });

      if (selectedServer) {
        await selectedServer.incrementUserCount();
      }
    } else {
      return res.status(500).json({
        success: false,
        message: 'Invalid register mode configuration'
      });
    }

    const token = generateToken(user.username);

    if (user.dataServer) {
      const userData = user.toObject();
      delete userData._id;
      delete userData.__v;

      const syncResult = await syncUserToServer(user.dataServer, userData);
      if (!syncResult.success) {
        // console.error('[Register] Failed to sync user to data server:', syncResult.message);
      }
    }

    res.status(201).json({
      success: true,
      data: {
        userId: user._id,
        username: user.username,
        email: user.email,
        isSelfHosted: user.isSelfHosted,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionExpireAt: user.subscriptionExpireAt,
        dataServer: user.dataServer,
        afdianPlanName: user.afdianPlanName,
        wordLimit: user.wordLimit,
        token
      }
    });
  } catch (error) {
    // console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration',
      error: error.message
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const registerMode = process.env.REGISTER_MODE || 'localhost';

    if (registerMode === 'afdian') {
      return res.status(403).json({
        success: false,
        message: 'Login is only available through Afdian OAuth'
      });
    }

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide username and password'
      });
    }

    // 查找用户（包含密码字段）
    const user = await User.findOne({ username }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // 验证密码
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const token = generateToken(user.username);

    res.status(200).json({
      success: true,
      data: {
        userId: user._id,
        username: user.username,
        email: user.email,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionExpireAt: user.subscriptionExpireAt,
        isSubscriptionValid: user.isSubscriptionValid(),
        dataServer: user.dataServer,
        afdianPlanName: user.afdianPlanName,
        wordLimit: user.wordLimit,
        wordCount: user.wordCount,
        token
      }
    });
  } catch (error) {
    // console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user info
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const actualWordCount = await Word.countDocuments({ userId: req.user._id });

    if (req.user.wordCount !== actualWordCount) {
      req.user.wordCount = actualWordCount;
      await req.user.save();
    }

    const isOfficialServer = process.env.SERVER_ID === 'official-server';
    const mainServerUrl = process.env.MAIN_SERVER_URL || 'https://dashboard.lingkuma.org';

    if (!isOfficialServer) {
      const now = new Date();
      if (req.user.subscriptionExpireAt) {
        const isExpired = now > req.user.subscriptionExpireAt;
        if (isExpired && req.user.subscriptionStatus !== 'expired') {
          req.user.subscriptionStatus = 'expired';
          await req.user.save();
        } else if (!isExpired && req.user.subscriptionStatus === 'expired') {
          req.user.subscriptionStatus = 'active';
          await req.user.save();
        }
      }

      const userConfig = {
        subscriptionStatus: req.user.subscriptionStatus,
        subscriptionExpireAt: req.user.subscriptionExpireAt,
        afdianPlanName: req.user.afdianPlanName || '',
        wordLimit: req.user.wordLimit || 20000,
        wordCount: req.user.wordCount,
        externalSubscription: req.user.externalSubscription || null,
        dataServer: req.user.dataServer || ''
      };

      const syncResult = await syncUserConfigToServer(mainServerUrl, req.user.username, userConfig);
      if (!syncResult.success) {
        // console.error('[GET /api/auth/me] Failed to sync user config to main server:', syncResult.message);
      }
    }

    res.status(200).json({
      success: true,
      data: {
        userId: req.user._id,
        username: req.user.username,
        email: req.user.email,
        isSelfHosted: req.user.isSelfHosted || false,
        subscriptionStatus: req.user.subscriptionStatus,
        subscriptionExpireAt: req.user.subscriptionExpireAt,
        isSubscriptionValid: req.user.isSubscriptionValid(),
        dataServer: req.user.dataServer || '',
        afdianPlanName: req.user.afdianPlanName || '',
        wordLimit: req.user.wordLimit || 20000,
        wordCount: req.user.wordCount || 0,
        externalSubscription: req.user.externalSubscription || null
      }
    });
  } catch (error) {
    // console.error('Get user info error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/auth/verify-subscription
// @desc    Verify external subscription (e.g., Afdian)
// @access  Private
router.post('/verify-subscription', protect, async (req, res) => {
  try {
    const { platform, externalUserId, apiToken } = req.body;

    // TODO: 这里需要调用外部API（如爱发电）验证订阅状态
    // 示例：const subscriptionData = await verifyAfdianSubscription(externalUserId, apiToken);
    
    // 暂时模拟验证成功，增加30天订阅
    const daysToAdd = 30;
    await req.user.updateSubscription(daysToAdd, platform, externalUserId);

    res.status(200).json({
      success: true,
      message: 'Subscription verified and updated',
      data: {
        subscriptionStatus: req.user.subscriptionStatus,
        subscriptionExpireAt: req.user.subscriptionExpireAt,
        daysAdded: daysToAdd
      }
    });
  } catch (error) {
    // console.error('Verify subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during subscription verification',
      error: error.message
    });
  }
});

// @route   POST /api/auth/register-from-auth
// @desc    Register user from auth server (internal use)
// @access  Internal (from auth server)
router.post('/register-from-auth', async (req, res) => {
  try {
    // console.log('[Data Server] Received register-from-auth request');
    // console.log('[Data Server] Headers:', req.headers);
    // console.log('[Data Server] Body:', req.body);

    // 验证请求来自认证服务器
    if (req.headers['x-auth-server'] !== 'true') {
      // console.log('[Data Server] Unauthorized: x-auth-server header missing or invalid');
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: This endpoint is for internal use only'
      });
    }

    const { username, email, password, userId } = req.body;

    // 验证必填字段
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide username, email and password'
      });
    }

    // 检查用户是否已存在
    const userExists = await User.findOne({ $or: [{ email }, { username }] });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'User already exists on this data server'
      });
    }

    // 创建用户（官方服务器用户，有订阅限制）
    const user = await User.create({
      username,
      email,
      password,
      isSelfHosted: false  // 标记为官方服务器用户
      // subscriptionStatus 和 subscriptionExpireAt 使用默认值（trial + 7天）
    });

    // 生成数据服务器的 token（使用数据服务器的 JWT_SECRET）
    const token = generateToken(user.username);

    res.status(201).json({
      success: true,
      message: 'User created on data server',
      data: {
        userId: user._id,
        username: user.username,
        email: user.email,
        isSelfHosted: user.isSelfHosted,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionExpireAt: user.subscriptionExpireAt,
        token  // 返回数据服务器生成的 token
      }
    });
  } catch (error) {
    // console.error('Register from auth server error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration',
      error: error.message
    });
  }
});

// @route   POST /api/auth/extend-trial
// @desc    Extend trial period (for testing)
// @access  Private
router.post('/extend-trial', protect, async (req, res) => {
  try {
    const { days = 7 } = req.body;

    await req.user.updateSubscription(days);

    res.status(200).json({
      success: true,
      message: `Trial extended by ${days} days`,
      data: {
        subscriptionStatus: req.user.subscriptionStatus,
        subscriptionExpireAt: req.user.subscriptionExpireAt
      }
    });
  } catch (error) {
    // console.error('Extend trial error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/auth/bind-afdian
// @desc    Bind Afdian user ID
// @access  Private
router.post('/bind-afdian', protect, async (req, res) => {
  try {
    // 自建服务器用户不支持爱发电绑定
    if (req.user.isSelfHosted) {
      return res.status(403).json({
        success: false,
        message: 'Self-hosted users do not need Afdian subscription'
      });
    }

    const { afdianUserId } = req.body;

    if (!afdianUserId || typeof afdianUserId !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid Afdian user ID'
      });
    }

    // 绑定爱发电账号
    await req.user.bindAfdian(afdianUserId);

    res.status(200).json({
      success: true,
      message: 'Afdian account bound successfully',
      data: {
        afdianUserId: req.user.externalSubscription.afdianUserId,
        subscriptionStatus: req.user.subscriptionStatus,
        subscriptionExpireAt: req.user.subscriptionExpireAt
      }
    });
  } catch (error) {
    // console.error('Bind Afdian error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to bind Afdian account',
      error: error.message
    });
  }
});

// @route   POST /api/auth/verify-afdian
// @desc    Verify and refresh Afdian subscription status
// @access  Private
router.post('/verify-afdian', protect, async (req, res) => {
  try {
    // console.log('[verify-afdian] req.user:', JSON.stringify(req.user, null, 2));

    // 自建服务器用户不支持爱发电验证
    if (req.user.isSelfHosted) {
      return res.status(403).json({
        success: false,
        message: 'Self-hosted users do not need Afdian subscription'
      });
    }

    // 从请求体获取 afdianUserId，如果没有则使用已绑定的 ID
    const { afdianUserId: requestAfdianUserId } = req.body;
    let afdianUserId = requestAfdianUserId || req.user.externalSubscription?.afdianUserId || req.user.afdianUserId;

    // console.log('[verify-afdian] requestAfdianUserId:', requestAfdianUserId);
    // console.log('[verify-afdian] afdianUserId from user:', req.user.externalSubscription?.afdianUserId, 'or req.user.afdianUserId:', req.user.afdianUserId);
    // console.log('[verify-afdian] final afdianUserId:', afdianUserId);

    if (!afdianUserId) {
      return res.status(400).json({
        success: false,
        message: 'No Afdian account bound. Please bind your Afdian account first.'
      });
    }

    // 如果请求体中提供了新的 afdianUserId，则更新用户的绑定
    if (requestAfdianUserId && requestAfdianUserId !== req.user.externalSubscription?.afdianUserId && requestAfdianUserId !== req.user.afdianUserId) {
      req.user.externalSubscription = req.user.externalSubscription || {};
      req.user.externalSubscription.afdianUserId = requestAfdianUserId;
      req.user.afdianUserId = requestAfdianUserId;
    }

    // 调用爱发电API验证订阅状态
    const afdianApiUrl = `https://api.lingkuma.org/api/auth/afdian/getPlans?user_id=${afdianUserId}`;

    let afdianResponse;
    try {
      const response = await fetch(afdianApiUrl);
      afdianResponse = await response.json();
    } catch (fetchError) {
      // console.error('Afdian API fetch error:', fetchError);
      return res.status(500).json({
        success: false,
        message: 'Failed to connect to Afdian API',
        error: fetchError.message
      });
    }

    // 刷新订阅状态
    const result = await req.user.refreshAfdianSubscription(afdianResponse);

    // 保存用户数据
    await req.user.save();

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        extended: result.extended,
        afdianUserId: req.user.externalSubscription?.afdianUserId || req.user.afdianUserId,
        subscriptionStatus: req.user.subscriptionStatus,
        subscriptionExpireAt: req.user.subscriptionExpireAt,
        lastRefreshTime: req.user.externalSubscription?.lastRefreshTime,
        afdianPlanName: afdianResponse.plan_name || null,
        afdianUserName: afdianResponse.user_name || null,
        wordLimit: req.user.wordLimit,
        wordCount: req.user.wordCount
      }
    });
  } catch (error) {
    // console.error('Verify Afdian error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during Afdian verification',
      error: error.message
    });
  }
});

// @route   GET /api/auth/afdian/authorize
// @desc    Generate Afdian OAuth authorization URL
// @access  Public
router.get('/afdian/authorize', (req, res) => {
  try {
    const { redirect_uri: customRedirectUri, state } = req.query;
    
    const stateValue = state || crypto.randomBytes(16).toString('hex');
    const redirectUri = customRedirectUri || AFDIAN_CONFIG.redirectUri;
    
    const authUrl = `${AFDIAN_CONFIG.authDomain}/oauth2/authorize?client_id=${AFDIAN_CONFIG.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${stateValue}&scope=basic`;
    
    res.status(200).json({
      success: true,
      data: {
        authUrl,
        state: stateValue
      }
    });
  } catch (error) {
    // console.error('Generate Afdian auth URL error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate authorization URL',
      error: error.message
    });
  }
});

// @route   GET /api/auth/afdian/callback
// @desc    Handle Afdian OAuth callback
// @access  Public
router.get('/afdian/callback', async (req, res) => {
  const { code, state, redirect_uri: customRedirectUri } = req.query;
  
  try {
    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Authorization code is required'
      });
    }
    
    const redirectUri = customRedirectUri || AFDIAN_CONFIG.redirectUri;
    
    const tokenResponse = await fetch(`${AFDIAN_CONFIG.apiDomain}/oauth2/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: AFDIAN_CONFIG.clientId,
        client_secret: AFDIAN_CONFIG.clientSecret,
        code: code,
        redirect_uri: redirectUri
      }).toString()
    });
    
    const tokenData = await tokenResponse.json();

    if (tokenData.ec !== 200 || !tokenData.data) {
      // console.error('Afdian OAuth error:', tokenData);
      return res.status(400).json({
        success: false,
        message: 'Failed to get user info',
        error: tokenData.em || 'Unknown error'
      });
    }
    
    const afdianUser = tokenData.data;
    const afdianUserId = afdianUser.user_id;
    const afdianUsername = afdianUser.name || afdianUser.user_id;
    
    let user = await User.findOne({ afdianUserId });
    
    let finalUser;
    let isNewUser = false;
    let extensionCallbackUrl = null;
    
    if (state) {
      const decodedState = decodeURIComponent(state);
      if (isExtensionUrl(decodedState)) {
        extensionCallbackUrl = decodedState;
      }
    }
    
    if (user) {
      finalUser = user;
      
      if (user.externalSubscription) {
        user.externalSubscription.lastVerified = new Date();
      }
      
      if (!user.dataServer) {
        const DataServer = require('../models/DataServer');
        const availableServers = await DataServer.find({ available: true, status: 'active' }).sort({ priority: -1 });
        if (availableServers.length > 0) {
          user.dataServer = availableServers[0].url;
        }
      }
      
      await user.save();
    } else {
      const username = `afdian_${afdianUserId}`;
      
      user = await User.findOne({ username });
      
      if (user) {
        finalUser = user;
        
        if (!user.externalSubscription) {
          user.externalSubscription = {};
        }
        
        user.externalSubscription.platform = 'afdian';
        user.externalSubscription.userId = afdianUserId;
        user.externalSubscription.afdianUserId = afdianUserId;
        user.externalSubscription.afdianUsername = afdianUsername;
        user.externalSubscription.lastVerified = new Date();
        user.externalSubscription.lastRefreshTime = new Date();
        
        if (!user.afdianUserId) {
          user.afdianUserId = afdianUserId;
        }
        
        if (!user.dataServer) {
          const DataServer = require('../models/DataServer');
          const availableServers = await DataServer.find({ available: true, status: 'active' }).sort({ priority: -1 });
          if (availableServers.length > 0) {
            user.dataServer = availableServers[0].url;
          }
        }
        
        await user.save();
      } else {
        isNewUser = true;
        
        const afdianApiUrl = `https://api.lingkuma.org/api/auth/afdian/getPlans?user_id=${afdianUserId}`;
        
        let subscriptionExpireAt = new Date(Date.now() + 32 * 24 * 60 * 60 * 1000);
        let subscriptionStatus = 'active';
        let planName = '';
        let wordLimit = 20000;
        
        try {
          const afdianResponse = await fetch(afdianApiUrl);
          const afdianData = await afdianResponse.json();
          
          if (!afdianData.success || !afdianData.plan_name) {
            return res.status(400).json({
              success: false,
              message: 'No active subscription found for this Afdian user ID'
            });
          }
          
          planName = afdianData.plan_name;
          
          const planLimits = {
            '贪吃熊_alpha': 20000,
            '胖胖熊_alpha': 40000,
            '肥肥熊_alpha': 60000,
            '田中熊_alpha': 80000,
            '雨多熊_alpha': 333333,
            '誓约熊_alpha': 666666
          };
          wordLimit = planLimits[planName] || 20000;
          
          subscriptionExpireAt = new Date(Date.now() + 32 * 24 * 60 * 60 * 1000);
          subscriptionStatus = 'active';
        } catch (error) {
          // console.error('Afdian subscription check error:', error);
          return res.status(500).json({
            success: false,
            message: 'Failed to verify Afdian subscription',
            error: error.message
          });
        }
        
        const email = `${afdianUserId}@afdian.user`;
        const password = crypto.randomBytes(32).toString('hex');
        
        let selectedServer = null;
        let serverId = null;
        
        if (state && !extensionCallbackUrl) {
          const decodedState = decodeURIComponent(state);
          try {
            serverId = decodedState;
            const DataServer = require('../models/DataServer');
            selectedServer = await DataServer.findById(serverId);
            if (selectedServer && !selectedServer.available) {
              selectedServer = null;
            }
          } catch (error) {
            // console.error('Error finding server:', error);
          }
        }
        
        if (!selectedServer) {
          const DataServer = require('../models/DataServer');
          const availableServers = await DataServer.find({ available: true, status: 'active' }).sort({ priority: -1 });
          if (availableServers.length > 0) {
            selectedServer = availableServers[0];
          }
        }
        
        finalUser = await User.create({
          username,
          email,
          password,
          isSelfHosted: false,
          subscriptionStatus,
          subscriptionExpireAt,
          dataServer: selectedServer ? selectedServer.url : '',
          afdianUserId: afdianUserId,
          afdianPlanName: planName,
          wordLimit: wordLimit,
          externalSubscription: {
            platform: 'afdian',
            userId: afdianUserId,
            afdianUserId: afdianUserId,
            afdianUsername: afdianUsername,
            lastVerified: new Date(),
            lastRefreshTime: new Date()
          }
        });
        
        if (selectedServer) {
          await selectedServer.incrementUserCount();
        }
  
        if (finalUser.dataServer) {
          const userData = finalUser.toObject();
          delete userData._id;
          delete userData.__v;
  
          const syncResult = await syncUserToServer(finalUser.dataServer, userData);
          if (!syncResult.success) {
            // console.error('[Afdian OAuth] Failed to sync user to data server:', syncResult.message);
          }
        }
      }
    }
    
    const token = generateToken(finalUser.username);
    
    if (extensionCallbackUrl || (redirectUri && isExtensionUrl(redirectUri))) {
      const callbackUrl = new URL(extensionCallbackUrl || redirectUri);
      callbackUrl.searchParams.set('token', token);
      callbackUrl.searchParams.set('username', finalUser.username);
      callbackUrl.searchParams.set('isNewUser', isNewUser);
      callbackUrl.searchParams.set('afdianUserId', afdianUserId);
      callbackUrl.searchParams.set('dataServer', finalUser.dataServer || '');
      callbackUrl.searchParams.set('afdianPlanName', finalUser.afdianPlanName || '');
      callbackUrl.searchParams.set('wordLimit', finalUser.wordLimit || 20000);
      callbackUrl.searchParams.set('wordCount', finalUser.wordCount || 0);
      callbackUrl.searchParams.set('subscriptionStatus', finalUser.subscriptionStatus || '');
      callbackUrl.searchParams.set('subscriptionExpireAt', finalUser.subscriptionExpireAt ? finalUser.subscriptionExpireAt.getTime() : '');

      return res.redirect(callbackUrl.toString());
    } else {
      return res.redirect(`/dashboard?token=${token}&username=${encodeURIComponent(finalUser.username)}&isNewUser=${isNewUser}&dataServer=${encodeURIComponent(finalUser.dataServer || '')}&afdianUserId=${afdianUserId}&afdianPlanName=${encodeURIComponent(finalUser.afdianPlanName || '')}&wordLimit=${finalUser.wordLimit || 20000}&wordCount=${finalUser.wordCount || 0}&subscriptionStatus=${encodeURIComponent(finalUser.subscriptionStatus || '')}&subscriptionExpireAt=${finalUser.subscriptionExpireAt ? finalUser.subscriptionExpireAt.getTime() : ''}`);
    }
  } catch (error) {
    // console.error('Afdian OAuth callback error:', error);

    let extensionCallbackUrl = null;
    if (state) {
      const decodedState = decodeURIComponent(state);
      if (isExtensionUrl(decodedState)) {
        extensionCallbackUrl = decodedState;
      }
    }
    
    if (!extensionCallbackUrl && redirectUri && isExtensionUrl(redirectUri)) {
      extensionCallbackUrl = redirectUri;
    }
    
    if (extensionCallbackUrl) {
      const callbackUrl = new URL(extensionCallbackUrl);
      callbackUrl.searchParams.set('error', 'oauth_failed');
      callbackUrl.searchParams.set('message', encodeURIComponent(error.message));
      return res.redirect(callbackUrl.toString());
    }
    
    res.status(500).json({
      success: false,
      message: 'OAuth callback failed',
      error: error.message
    });
  }
});

module.exports = router;


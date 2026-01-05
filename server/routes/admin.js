const express = require('express');
const router = express.Router();
const DataServer = require('../models/DataServer');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { generateAdminToken, verifyAdminSession } = require('../middleware/adminAuth');
const { syncUserToServer } = require('../utils/serverSync');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

router.post('/login', (req, res) => {
  const { adminPassword } = req.body;
  
  if (adminPassword === ADMIN_PASSWORD) {
    const token = generateAdminToken();
    res.status(200).json({
      success: true,
      message: 'Admin login successful',
      data: {
        token
      }
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'Invalid admin password'
    });
  }
});

router.post('/stats', verifyAdminSession, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({});
    const totalServers = await DataServer.countDocuments({});
    const activeServers = await DataServer.countDocuments({ status: 'active' });
    const healthyServers = await DataServer.countDocuments({ healthStatus: 'healthy' });
    
    const servers = await DataServer.find({});
    const totalCapacity = servers.reduce((sum, s) => sum + s.maxUsers, 0);
    const totalUsed = servers.reduce((sum, s) => sum + s.userCount, 0);
    
    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalServers,
        activeServers,
        healthyServers,
        totalCapacity,
        totalUsed,
        utilizationRate: totalCapacity > 0 ? ((totalUsed / totalCapacity) * 100).toFixed(2) : 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stats',
      error: error.message
    });
  }
});

router.post('/servers/create', verifyAdminSession, async (req, res) => {
  try {
    const { url, name, location, maxUsers, priority } = req.body;
    
    if (!url || !name) {
      return res.status(400).json({
        success: false,
        message: 'URL and name are required'
      });
    }
    
    const existingServer = await DataServer.findOne({ url });
    if (existingServer) {
      return res.status(400).json({
        success: false,
        message: 'Server with this URL already exists'
      });
    }
    
    const server = await DataServer.create({
      url,
      name,
      location: location || '',
      maxUsers: maxUsers || 10000,
      priority: priority || 100
    });
    
    res.status(201).json({
      success: true,
      data: server
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create server',
      error: error.message
    });
  }
});

router.post('/servers', verifyAdminSession, async (req, res) => {
  try {
    const { adminPassword } = req.body;
    
    const servers = await DataServer.find({});
    
    const serversWithStats = await Promise.all(
      servers.map(async (server) => {
        const userCount = await User.countDocuments({ dataServer: server.url });
        return {
          ...server.toObject(),
          userCount
        };
      })
    );
    
    res.status(200).json({
      success: true,
      data: serversWithStats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch servers',
      error: error.message
    });
  }
});

router.put('/servers/:id', verifyAdminSession, async (req, res) => {
  try {
    const { name, url, location, status, available, maxUsers, priority } = req.body;
    
    const server = await DataServer.findByIdAndUpdate(
      req.params.id,
      { name, url, location, status, available, maxUsers, priority },
      { new: true, runValidators: true }
    );
    
    if (!server) {
      return res.status(404).json({
        success: false,
        message: 'Server not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: server
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update server',
      error: error.message
    });
  }
});

router.delete('/servers/:id', verifyAdminSession, async (req, res) => {
  try {
    const server = await DataServer.findById(req.params.id);
    
    if (!server) {
      return res.status(404).json({
        success: false,
        message: 'Server not found'
      });
    }
    
    if (server.userCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete server with active users'
      });
    }
    
    await DataServer.findByIdAndDelete(req.params.id);
    
    res.status(200).json({
      success: true,
      message: 'Server deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete server',
      error: error.message
    });
  }
});

router.post('/servers/:id/health-check', verifyAdminSession, async (req, res) => {
  try {
    const server = await DataServer.findById(req.params.id);
    
    if (!server) {
      return res.status(404).json({
        success: false,
        message: 'Server not found'
      });
    }
    
    await server.checkHealth();
    
    res.status(200).json({
      success: true,
      data: server
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to check server health',
      error: error.message
    });
  }
});

router.post('/servers/health-check-all', verifyAdminSession, async (req, res) => {
  try {
    const servers = await DataServer.find({});
    
    const results = await Promise.all(
      servers.map(server => server.checkHealth())
    );
    
    res.status(200).json({
      success: true,
      data: results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to check all servers health',
      error: error.message
    });
  }
});

router.get('/servers/public', async (req, res) => {
  try {
    const servers = await DataServer.find({ available: true, status: 'active' }).sort({ priority: -1 });
    
    res.status(200).json({
      success: true,
      data: { servers }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available servers',
      error: error.message
    });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({});
    const totalServers = await DataServer.countDocuments({});
    const activeServers = await DataServer.countDocuments({ status: 'active' });
    const healthyServers = await DataServer.countDocuments({ healthStatus: 'healthy' });
    
    const servers = await DataServer.find({});
    const totalCapacity = servers.reduce((sum, s) => sum + s.maxUsers, 0);
    const totalUsed = servers.reduce((sum, s) => sum + s.userCount, 0);
    
    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalServers,
        activeServers,
        healthyServers,
        totalCapacity,
        totalUsed,
        utilizationRate: totalCapacity > 0 ? ((totalUsed / totalCapacity) * 100).toFixed(2) : 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stats',
      error: error.message
    });
  }
});

router.get('/users', verifyAdminSession, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const filter = {};
    
    if (req.query.username) {
      filter.username = { $regex: req.query.username, $options: 'i' };
    }
    
    if (req.query.email) {
      filter.email = { $regex: req.query.email, $options: 'i' };
    }
    
    if (req.query.afdianUserId) {
      filter.afdianUserId = { $regex: req.query.afdianUserId, $options: 'i' };
    }
    
    if (req.query.dataServer) {
      filter.dataServer = req.query.dataServer;
    }
    
    if (req.query.subscriptionStatus) {
      filter.subscriptionStatus = req.query.subscriptionStatus;
    }
    
    if (req.query.afdianPlanName) {
      filter.afdianPlanName = req.query.afdianPlanName;
    }
    
    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await User.countDocuments(filter);
    
    res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
});

router.get('/users/:id', verifyAdminSession, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user',
      error: error.message
    });
  }
});

router.delete('/users/:id', verifyAdminSession, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    if (user.dataServer) {
      const server = await DataServer.findOne({ url: user.dataServer });
      if (server) {
        await server.decrementUserCount();
      }
    }
    
    await User.findByIdAndDelete(req.params.id);
    
    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error: error.message
    });
  }
});

router.put('/users/:id', verifyAdminSession, async (req, res) => {
  try {
    const { username, email, dataServer, subscriptionStatus, subscriptionExpireAt, afdianPlanName, wordLimit, wordCount, externalSubscription } = req.body;
    
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    if (username) user.username = username;
    if (email) user.email = email;
    if (dataServer !== undefined) user.dataServer = dataServer;
    if (subscriptionStatus) user.subscriptionStatus = subscriptionStatus;
    if (subscriptionExpireAt) user.subscriptionExpireAt = new Date(subscriptionExpireAt);
    if (afdianPlanName) user.afdianPlanName = afdianPlanName;
    if (wordLimit !== undefined) user.wordLimit = wordLimit;
    if (wordCount !== undefined) user.wordCount = wordCount;
    if (externalSubscription) user.externalSubscription = externalSubscription;
    
    user.updatedAt = new Date();
    await user.save();
    
    if (user.dataServer) {
      const userData = user.toObject();
      delete userData._id;
      delete userData.__v;
      
      const syncResult = await syncUserToServer(user.dataServer, userData);
      if (!syncResult.success) {
        // console.error('[Admin Update User] Failed to sync user to data server:', syncResult.message);
      }
    }
    
    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: error.message
    });
  }
});

module.exports = router;

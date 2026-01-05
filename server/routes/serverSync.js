const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { verifyServerRequest } = require('../middleware/serverAuth');

router.use(verifyServerRequest);

router.post('/sync-user', async (req, res) => {
  try {
    const { userData } = req.body;

    if (!userData || !userData.username || !userData.email || !userData.password) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user data'
      });
    }

    let user = await User.findOne({ 
      $or: [
        { username: userData.username },
        { email: userData.email }
      ]
    });

    if (user) {
      user.username = userData.username;
      user.email = userData.email;
      user.password = userData.password;
      user.isSelfHosted = userData.isSelfHosted;
      user.subscriptionStatus = userData.subscriptionStatus;
      user.subscriptionExpireAt = userData.subscriptionExpireAt;
      user.afdianUserId = userData.afdianUserId || '';
      user.dataServer = userData.dataServer || '';
      user.afdianPlanName = userData.afdianPlanName || '';
      user.wordLimit = userData.wordLimit || 20000;
      user.wordCount = userData.wordCount || 0;
      user.externalSubscription = userData.externalSubscription || {};

      await user.save();

      return res.status(200).json({
        success: true,
        message: 'User updated successfully',
        data: {
          userId: user._id,
          username: user.username,
          synced: true
        }
      });
    } else {
      user = await User.create({
        username: userData.username,
        email: userData.email,
        password: userData.password,
        isSelfHosted: userData.isSelfHosted,
        subscriptionStatus: userData.subscriptionStatus,
        subscriptionExpireAt: userData.subscriptionExpireAt,
        afdianUserId: userData.afdianUserId || '',
        dataServer: userData.dataServer || '',
        afdianPlanName: userData.afdianPlanName || '',
        wordLimit: userData.wordLimit || 20000,
        wordCount: userData.wordCount || 0,
        externalSubscription: userData.externalSubscription || {}
      });

      return res.status(201).json({
        success: true,
        message: 'User created successfully',
        data: {
          userId: user._id,
          username: user.username,
          synced: true
        }
      });
    }
  } catch (error) {
    // console.error('Sync user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during user sync',
      error: error.message
    });
  }
});

router.post('/sync-user-stats', async (req, res) => {
  try {
    const { username, wordCount, subscriptionStatus, subscriptionExpireAt } = req.body;

    if (!username) {
      return res.status(400).json({
        success: false,
        message: 'Username is required'
      });
    }

    const user = await User.findOne({ username });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (wordCount !== undefined) {
      user.wordCount = wordCount;
    }

    if (subscriptionStatus !== undefined) {
      user.subscriptionStatus = subscriptionStatus;
    }

    if (subscriptionExpireAt !== undefined) {
      user.subscriptionExpireAt = new Date(subscriptionExpireAt);
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'User stats synced successfully',
      data: {
        userId: user._id,
        username: user.username,
        wordCount: user.wordCount,
        subscriptionStatus: user.subscriptionStatus
      }
    });
  } catch (error) {
    // console.error('Sync user stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during stats sync',
      error: error.message
    });
  }
});

router.post('/sync-user-config', async (req, res) => {
  try {
    const {
      username,
      subscriptionStatus,
      subscriptionExpireAt,
      afdianPlanName,
      wordLimit,
      wordCount,
      externalSubscription,
      dataServer
    } = req.body;

    if (!username) {
      return res.status(400).json({
        success: false,
        message: 'Username is required'
      });
    }

    const user = await User.findOne({ username });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (subscriptionStatus !== undefined) {
      user.subscriptionStatus = subscriptionStatus;
    }

    if (subscriptionExpireAt !== undefined) {
      user.subscriptionExpireAt = new Date(subscriptionExpireAt);
    }

    if (afdianPlanName !== undefined) {
      user.afdianPlanName = afdianPlanName;
    }

    if (wordLimit !== undefined) {
      user.wordLimit = wordLimit;
    }

    if (wordCount !== undefined) {
      user.wordCount = wordCount;
    }

    if (externalSubscription !== undefined) {
      user.externalSubscription = externalSubscription;
    }

    if (dataServer !== undefined) {
      user.dataServer = dataServer;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'User config synced successfully',
      data: {
        userId: user._id,
        username: user.username,
        subscriptionStatus: user.subscriptionStatus,
        wordCount: user.wordCount,
        wordLimit: user.wordLimit
      }
    });
  } catch (error) {
    // console.error('Sync user config error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during config sync',
      error: error.message
    });
  }
});

router.get('/user/:username', async (req, res) => {
  try {
    const { username } = req.params;

    const user = await User.findOne({ username }).select('-password');

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
    // console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

module.exports = router;

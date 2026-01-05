const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  // 用户类型标识
  isSelfHosted: {
    type: Boolean,
    default: false  // false = 官方服务器用户，true = 自建服务器用户
  },
  // 订阅相关字段（仅官方服务器用户需要）
  subscriptionStatus: {
    type: String,
    enum: ['trial', 'active', 'expired', 'localhost'],  // localhost = 自建服务器用户
    default: 'trial'
  },
  subscriptionExpireAt: {
    type: Date,
    default: function() {
      // 默认试用期 7 天
      const trialDays = parseInt(process.env.TRIAL_DAYS) || 7;
      return new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
    }
  },
  // 外部订阅平台信息（如爱发电）
  externalSubscription: {
    platform: String,
    userId: String,
    afdianUserId: String,
    lastVerified: Date,
    lastRefreshTime: Date
  },
  // 爱发电用户ID（用于路由）
  afdianUserId: {
    type: String,
    index: true
  },
  // 分配的数据服务器地址
  dataServer: {
    type: String,
    default: ''
  },
  // 爱发电计划名称
  afdianPlanName: {
    type: String,
    default: ''
  },
  // 单词条目数量限制
  wordLimit: {
    type: Number,
    default: 20000
  },
  // 当前单词条目数量
  wordCount: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// 密码加密中间件
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// 验证密码方法
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// 检查订阅是否有效
userSchema.methods.isSubscriptionValid = function() {
  if (!this.subscriptionExpireAt) {
    return false;
  }
  return new Date() < this.subscriptionExpireAt;
};

// 更新订阅到期时间
userSchema.methods.extendSubscription = function(days) {
  const currentExpire = this.subscriptionExpireAt || new Date();
  const newExpire = new Date(Math.max(currentExpire.getTime(), Date.now()) + days * 24 * 60 * 60 * 1000);

  this.subscriptionExpireAt = newExpire;
  this.subscriptionStatus = 'active';
  this.updatedAt = new Date();

  return this.save();
};

// 绑定爱发电账号
userSchema.methods.bindAfdian = async function(afdianUserId) {
  // 检查该爱发电ID是否已被其他用户绑定
  const existingUser = await this.constructor.findOne({
    'externalSubscription.afdianUserId': afdianUserId,
    _id: { $ne: this._id }
  });

  if (existingUser) {
    throw new Error('This Afdian ID is already bound to another account');
  }

  this.externalSubscription = {
    ...this.externalSubscription,
    platform: 'afdian',
    afdianUserId: afdianUserId
  };

  this.updatedAt = new Date();
  return this.save();
};

// 刷新爱发电订阅状态
userSchema.methods.refreshAfdianSubscription = async function(afdianApiResponse) {
  const now = new Date();

  if (!this.externalSubscription) {
    this.externalSubscription = {};
  }
  this.externalSubscription.lastRefreshTime = now;
  this.externalSubscription.lastVerified = now;

  if (afdianApiResponse.success) {
    const currentExpire = this.subscriptionExpireAt;
    const planName = afdianApiResponse.plan_name || '';

    if (!currentExpire || now > currentExpire) {
      this.subscriptionExpireAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      this.subscriptionStatus = 'active';
      this.updatedAt = now;
      
      if (planName) {
        const planLimits = {
          '贪吃熊_alpha': 20000,
          '胖胖熊_alpha': 40000,
          '肥肥熊_alpha': 60000,
          '田中熊_alpha': 80000,
          '雨多熊_alpha': 333333,
          '誓约熊_alpha': 666666
        };
        this.afdianPlanName = planName;
        this.wordLimit = planLimits[planName] || 20000;
      }
      
      return { extended: true, message: 'Subscription extended by 30 days' };
    } else {
      if (planName) {
        const planLimits = {
          '贪吃熊_alpha': 20000,
          '胖胖熊_alpha': 40000,
          '肥肥熊_alpha': 60000,
          '田中熊_alpha': 80000,
          '雨多熊_alpha': 333333,
          '誓约熊_alpha': 666666
        };
        this.afdianPlanName = planName;
        this.wordLimit = planLimits[planName] || 20000;
      }
      this.subscriptionStatus = 'active';
      this.updatedAt = now;
      return { extended: false, message: 'Subscription is still valid, no extension needed' };
    }
  } else {
    return { extended: false, message: 'No valid Afdian subscription found' };
  }
};

// 根据爱发电计划设置条目限制
userSchema.methods.setWordLimitByPlan = function(planName) {
  const planLimits = {
    '贪吃熊_alpha': 20000,
    '胖胖熊_alpha': 40000,
    '肥肥熊_alpha': 60000,
    '田中熊_alpha': 80000,
    '雨多熊_alpha': 333333,
    '誓约熊_alpha': 666666
  };
  
  this.afdianPlanName = planName;
  this.wordLimit = planLimits[planName] || 20000;
  this.updatedAt = new Date();
  
  return this.save();
};

// 检查是否达到条目限制
userSchema.methods.checkWordLimit = function() {
  return this.wordCount >= this.wordLimit;
};

// 更新单词条目数量
userSchema.methods.updateWordCount = async function(delta) {
  this.wordCount = Math.max(0, this.wordCount + delta);
  this.updatedAt = new Date();
  return this.save();
};

// 更新时间戳
userSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('User', userSchema);


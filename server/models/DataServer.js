const mongoose = require('mongoose');

const dataServerSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  location: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'maintenance'],
    default: 'active'
  },
  available: {
    type: Boolean,
    default: true
  },
  userCount: {
    type: Number,
    default: 0
  },
  maxUsers: {
    type: Number,
    default: 10000
  },
  priority: {
    type: Number,
    default: 100
  },
  lastHealthCheck: {
    type: Date,
    default: null
  },
  healthStatus: {
    type: String,
    enum: ['healthy', 'unhealthy', 'unknown'],
    default: 'unknown'
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

dataServerSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

dataServerSchema.methods.incrementUserCount = async function() {
  this.userCount += 1;
  this.updatedAt = new Date();
  return this.save();
};

dataServerSchema.methods.decrementUserCount = async function() {
  if (this.userCount > 0) {
    this.userCount -= 1;
  }
  this.updatedAt = new Date();
  return this.save();
};

dataServerSchema.methods.checkHealth = async function() {
  try {
    const response = await fetch(`${this.url}/health`, {
      method: 'GET',
      timeout: 5000
    });
    
    if (response.ok) {
      this.healthStatus = 'healthy';
      this.lastHealthCheck = new Date();
    } else {
      this.healthStatus = 'unhealthy';
      this.lastHealthCheck = new Date();
    }
  } catch (error) {
    this.healthStatus = 'unhealthy';
    this.lastHealthCheck = new Date();
  }
  
  this.updatedAt = new Date();
  return this.save();
};

module.exports = mongoose.model('DataServer', dataServerSchema);

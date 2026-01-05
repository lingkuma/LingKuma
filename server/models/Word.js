const mongoose = require('mongoose');

const wordSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  word: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  term: {
    type: String,
    required: true
  },
  translations: [{
    type: String,
    trim: true
  }],
  tags: [{
    type: String,
    trim: true
  }],
  sentences: [{
    sentence: String,
    translation: String,
    url: String
  }],
  status: {
    type: String,
    default: '1'
  },
  language: {
    type: String,
    default: ''
  },
  statusHistory: {
    type: Map,
    of: {
      createTime: Number,
      updateTime: Number
    },
    default: {}
  },
  state1CreateTime: {
    type: Number
  },
  state1UpdateTime: {
    type: Number
  },
  state2CreateTime: {
    type: Number
  },
  state2UpdateTime: {
    type: Number
  },
  state3CreateTime: {
    type: Number
  },
  state3UpdateTime: {
    type: Number
  },
  state4CreateTime: {
    type: Number
  },
  state4UpdateTime: {
    type: Number
  },
  state5CreateTime: {
    type: Number
  },
  state5UpdateTime: {
    type: Number
  },
  isCustom: {
    type: Boolean,
    default: false
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

// 复合索引：用户ID + 单词（确保每个用户的单词唯一）
wordSchema.index({ userId: 1, word: 1 }, { unique: true });

// 状态时间字段索引（用于按状态筛选）
wordSchema.index({ userId: 1, state1CreateTime: 1 });
wordSchema.index({ userId: 1, state2CreateTime: 1 });
wordSchema.index({ userId: 1, state3CreateTime: 1 });
wordSchema.index({ userId: 1, state4CreateTime: 1 });
wordSchema.index({ userId: 1, state5CreateTime: 1 });

// 更新时间戳
wordSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Word', wordSchema);


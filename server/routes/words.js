const express = require('express');
const router = express.Router();
const Word = require('../models/Word');
const { protect, checkSubscription } = require('../middleware/auth');
const { syncUserStatsToServer } = require('../utils/serverSync');

function getSyncTargetUrl(user) {
  const isOfficialServer = process.env.SERVER_ID === 'official-server';
  
  if (isOfficialServer) {
    return user.dataServer;
  } else {
    return process.env.MAIN_SERVER_URL || 'https://dashboard.lingkuma.org';
  }
}

// 所有路由都需要认证和订阅验证
router.use(protect);
router.use(checkSubscription);

// @route   GET /api/words
// @desc    Get all words for current user (supports pagination)
// @access  Private
router.get('/', async (req, res) => {
  try {
    const { status, language, isCustom, startDate, endDate, statuses, page, limit } = req.query;

    const filter = { userId: req.user._id };

    // 状态筛选：支持单个状态或多个状态
    if (statuses) {
      // 多状态筛选（逗号分隔）
      const statusArray = statuses.split(',').map(s => s.trim());
      filter.status = { $in: statusArray };
    } else if (status) {
      // 单个状态筛选
      filter.status = status;
    }

    // 语言筛选
    if (language && language !== 'all') {
      filter.language = language;
    }

    // isCustom 筛选
    if (isCustom !== undefined) {
      filter.isCustom = isCustom === 'true';
    }

    // 日期范围筛选
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(parseInt(startDate));
      }
      if (endDate) {
        filter.createdAt.$lte = new Date(parseInt(endDate));
      }
    }

    // console.log('[GET /api/words] Filter:', JSON.stringify(filter));

    const pageNum = parseInt(page) || 0;
    const limitNum = Math.min(parseInt(limit) || 50, 100);

    if (pageNum > 0) {
      const total = await Word.countDocuments(filter);
      const skip = (pageNum - 1) * limitNum;

      const words = await Word.find(filter)
        .sort({ _id: 1 })
        .skip(skip)
        .limit(limitNum);

      const totalPages = Math.ceil(total / limitNum);

      // console.log(`[GET /api/words] Paginated: page ${pageNum}/${totalPages}, returned ${words.length} of ${total} total`);

      res.status(200).json({
        success: true,
        count: words.length,
        total: total,
        page: pageNum,
        totalPages: totalPages,
        hasMore: pageNum < totalPages,
        data: words
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Pagination required. Please specify page parameter (e.g., page=1&limit=50). Maximum limit is 100.'
      });
    }
  } catch (error) {
    // console.error('Get words error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/words/trend
// @desc    Get word trend data by date (supports multi-status filtering)
// @access  Private
router.get('/trend', async (req, res) => {
  try {
    const { startDate, endDate, language, status, statuses } = req.query;

    const filter = { userId: req.user._id };

    // 语言筛选
    if (language && language !== 'all') {
      filter.language = language;
    }

    // console.log('[GET /api/words/trend] Query params:', { startDate, endDate, language, status, statuses });

    let trendData = [];

    if (statuses && statuses !== 'all') {
      const statusArray = statuses.split(',').map(s => s.trim());

      for (const statusValue of statusArray) {
        const stateCreateTimeField = `state${statusValue}CreateTime`;

        const statusFilter = {
          ...filter,
          [stateCreateTimeField]: { $exists: true, $ne: null }
        };

        if (startDate || endDate) {
          statusFilter[stateCreateTimeField] = {};
          if (startDate) {
            statusFilter[stateCreateTimeField].$gte = parseInt(startDate);
          }
          if (endDate) {
            statusFilter[stateCreateTimeField].$lte = parseInt(endDate);
          }
        }

        // console.log(`[GET /api/words/trend] Status ${statusValue} filter:`, JSON.stringify(statusFilter));

        const statusTrend = await Word.aggregate([
          { $match: statusFilter },
          {
            $group: {
              _id: {
                year: { $year: { $toDate: `$${stateCreateTimeField}` } },
                month: { $month: { $toDate: `$${stateCreateTimeField}` } },
                day: { $dayOfMonth: { $toDate: `$${stateCreateTimeField}` } }
              },
              count: { $sum: 1 }
            }
          },
          {
            $project: {
              date: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: {
                    $dateFromParts: {
                      year: '$_id.year',
                      month: '$_id.month',
                      day: '$_id.day'
                    }
                  }
                }
              },
              count: 1,
              _id: 0
            }
          },
          { $sort: { date: 1 } }
        ]);

        trendData.push({
          status: statusValue,
          data: statusTrend
        });

        // console.log(`[GET /api/words/trend] Status ${statusValue}: ${statusTrend.length} data points`);
      }
    } else {
      const dateField = (status && status !== 'all') ? `state${status}CreateTime` : 'createdAt';

      if (status && status !== 'all') {
        filter[dateField] = { $exists: true, $ne: null };
      }

      if (startDate || endDate) {
        if (dateField === 'createdAt') {
          filter.createdAt = {};
          if (startDate) {
            filter.createdAt.$gte = new Date(parseInt(startDate));
          }
          if (endDate) {
            filter.createdAt.$lte = new Date(parseInt(endDate));
          }
        } else {
          filter[dateField] = {};
          if (startDate) {
            filter[dateField].$gte = parseInt(startDate);
          }
          if (endDate) {
            filter[dateField].$lte = parseInt(endDate);
          }
        }
      }

      // console.log('[GET /api/words/trend] Filter:', JSON.stringify(filter));

      const singleTrend = await Word.aggregate([
        { $match: filter },
        {
          $group: {
            _id: {
              year: { $year: { $toDate: `$${dateField}` } },
              month: { $month: { $toDate: `$${dateField}` } },
              day: { $dayOfMonth: { $toDate: `$${dateField}` } }
            },
            count: { $sum: 1 }
          }
        },
        {
          $project: {
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: {
                  $dateFromParts: {
                    year: '$_id.year',
                    month: '$_id.month',
                    day: '$_id.day'
                  }
                }
              }
            },
            count: 1,
            _id: 0
          }
        },
        { $sort: { date: 1 } }
      ]);

      trendData = singleTrend;
      // console.log(`[GET /api/words/trend] Found ${trendData.length} data points`);
    }

    res.status(200).json({
      success: true,
      count: Array.isArray(trendData) && trendData.length > 0 && trendData[0].data !== undefined 
        ? trendData.reduce((sum, s) => sum + (s.data ? s.data.length : 0), 0) 
        : trendData.length,
      data: trendData
    });
  } catch (error) {
    // console.error('Get word trend error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/words/by-status
// @desc    Get words by status with status time filtering (supports pagination)
// @access  Private
router.get('/by-status', async (req, res) => {
  try {
    const { statuses, startDate, endDate, page, limit } = req.query;

    if (!statuses) {
      return res.status(400).json({
        success: false,
        message: 'statuses parameter is required'
      });
    }

    const statusArray = statuses.split(',').map(s => s.trim());
    // console.log(`[GET /api/words/by-status] Statuses: ${statusArray.join(', ')}`);

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50;
    const skip = (pageNum - 1) * limitNum;

    const results = [];
    let totalCount = 0;

    for (const status of statusArray) {
      const stateCreateTimeField = `state${status}CreateTime`;

      const filter = {
        userId: req.user._id,
        [stateCreateTimeField]: { $exists: true, $ne: null }
      };

      if (startDate || endDate) {
        filter[stateCreateTimeField] = {};
        if (startDate) {
          filter[stateCreateTimeField].$gte = parseInt(startDate);
        }
        if (endDate) {
          filter[stateCreateTimeField].$lte = parseInt(endDate);
        }
      }

      // console.log(`[GET /api/words/by-status] Status ${status} filter:`, JSON.stringify(filter));

      const count = await Word.countDocuments(filter);
      totalCount += count;

      const totalPages = Math.ceil(count / limitNum);

      const words = await Word.find(filter)
        .sort({ [stateCreateTimeField]: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean();

      results.push({
        status: status,
        count: count,
        totalPages: totalPages,
        page: pageNum,
        words: words
      });
    }

    // console.log(`[GET /api/words/by-status] Page ${pageNum}, ${totalCount} total words across ${results.length} statuses`);

    res.status(200).json({
      success: true,
      count: totalCount,
      page: pageNum,
      limit: limitNum,
      data: results
    });
  } catch (error) {
    // console.error('Get words by status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/words/:word
// @desc    Get a single word
// @access  Private
router.get('/:word', async (req, res) => {
  try {
    const word = await Word.findOne({
      userId: req.user._id,
      word: req.params.word.toLowerCase()
    });

    if (!word) {
      return res.status(404).json({
        success: false,
        message: 'Word not found'
      });
    }

    res.status(200).json({
      success: true,
      data: word
    });
  } catch (error) {
    // console.error('Get word error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/words
// @desc    Create or update a word
// @access  Private
router.post('/', async (req, res) => {
  try {
    const wordData = req.body;
    
    if (wordData.word) {
      wordData.word = wordData.word.toLowerCase();
    }

    let word = await Word.findOne({
      userId: req.user._id,
      word: wordData.word
    });

    if (word) {
      Object.assign(word, wordData);
      word.updatedAt = Date.now();
      
      const updateData = { ...word.toObject(), _id: undefined, __v: undefined };
      delete updateData._id;
      delete updateData.__v;
      
      word = await Word.findOneAndUpdate(
        { userId: req.user._id, word: wordData.word },
        { $set: updateData },
        { new: true, upsert: false }
      );
    } else {
      const wordCount = await Word.countDocuments({ userId: req.user._id });
      
      if (wordCount >= req.user.wordLimit) {
        return res.status(403).json({
          success: false,
          message: `Word limit reached. Maximum ${req.user.wordLimit} words allowed. Current: ${wordCount}`
        });
      }
      
      const wordToCreate = { ...wordData, userId: req.user._id };

      if (wordToCreate.statusHistory && typeof wordToCreate.statusHistory === 'object') {
        ['1', '2', '3', '4', '5'].forEach(statusKey => {
          const statusEntry = wordToCreate.statusHistory[statusKey];
          if (statusEntry) {
            if (typeof statusEntry.createTime === 'number' && statusEntry.createTime > 0) {
              wordToCreate[`state${statusKey}CreateTime`] = statusEntry.createTime;
            }
            if (typeof statusEntry.updateTime === 'number' && statusEntry.updateTime > 0) {
              wordToCreate[`state${statusKey}UpdateTime`] = statusEntry.updateTime;
            }
          }
        });
      }

      word = await Word.create(wordToCreate);
      
      await req.user.updateWordCount(1);

      const syncTargetUrl = getSyncTargetUrl(req.user);
      if (syncTargetUrl) {
        const syncResult = await syncUserStatsToServer(syncTargetUrl, req.user.username, {
          wordCount: req.user.wordCount
        });
        if (!syncResult.success) {
          // console.error('[POST /api/words] Failed to sync user stats:', syncResult.message);
        }
      }
    }

    res.status(200).json({
      success: true,
      data: word
    });
  } catch (error) {
    // console.error('Create/Update word error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   PUT /api/words/:word
// @desc    Update a word
// @access  Private
router.put('/:word', async (req, res) => {
  try {
    const word = await Word.findOne({
      userId: req.user._id,
      word: req.params.word.toLowerCase()
    });

    if (!word) {
      return res.status(404).json({
        success: false,
        message: 'Word not found'
      });
    }

    const updateData = { ...req.body, updatedAt: Date.now() };
    delete updateData._id;
    delete updateData.__v;

    word = await Word.findOneAndUpdate(
      { userId: req.user._id, word: req.params.word.toLowerCase() },
      { $set: updateData },
      { new: true }
    );

    res.status(200).json({
      success: true,
      data: word
    });
  } catch (error) {
    // console.error('Update word error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   DELETE /api/words/:word
// @desc    Delete a word
// @access  Private
router.delete('/:word', async (req, res) => {
  try {
    const word = await Word.findOneAndDelete({
      userId: req.user._id,
      word: req.params.word.toLowerCase()
    });

    if (!word) {
      return res.status(404).json({
        success: false,
        message: 'Word not found'
      });
    }

    await req.user.updateWordCount(-1);

    const syncTargetUrl = getSyncTargetUrl(req.user);
    if (syncTargetUrl) {
      const syncResult = await syncUserStatsToServer(syncTargetUrl, req.user.username, {
        wordCount: req.user.wordCount
      });
      if (!syncResult.success) {
        // console.error('[DELETE /api/words] Failed to sync user stats:', syncResult.message);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Word deleted successfully'
    });
  } catch (error) {
    // console.error('Delete word error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/words/batch-get
// @desc    Batch get words by word list (for efficient querying)
// @access  Private
router.post('/batch-get', async (req, res) => {
  try {
    const { words } = req.body;

    if (!Array.isArray(words)) {
      return res.status(400).json({
        success: false,
        message: 'Words must be an array'
      });
    }

    // 将所有单词转为小写
    const wordsLower = words.map(w => w.toLowerCase());

    // 只查询请求的单词，只返回必要字段
    const foundWords = await Word.find({
      userId: req.user._id,
      word: { $in: wordsLower }
    }).select('word status isCustom language').lean();

    res.status(200).json({
      success: true,
      count: foundWords.length,
      data: foundWords
    });
  } catch (error) {
    // console.error('Batch get words error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/words/batch-sync
// @desc    Batch sync words (for data migration)
// @access  Private
router.post('/batch-sync', async (req, res) => {
  try {
    // console.log('[Batch Sync] Starting batch sync...');
    // console.log('[Batch Sync] User ID:', req.user?._id);
    // console.log('[Batch Sync] Request body keys:', Object.keys(req.body));

    const { words, mode = 'merge', clearFirst = false } = req.body;

    if (!Array.isArray(words)) {
      // console.error('[Batch Sync] Words is not an array:', typeof words);
      return res.status(400).json({
        success: false,
        message: 'Words must be an array'
      });
    }

    // console.log('[Batch Sync] Mode:', mode, 'Words count:', words.length);
    // console.log('[Batch Sync] First word sample:', words[0]);

    let created = 0;
    let updated = 0;
    let skipped = 0;

    const currentWordCount = await Word.countDocuments({ userId: req.user._id });
    const wordLimit = req.user.wordLimit;

    // console.log('[Batch Sync] Current word count:', currentWordCount, 'Word limit:', wordLimit);

    if (mode === 'replace') {
      // 完全替换模式
      // 如果是第一批（clearFirst=true），先删除所有现有单词
      if (clearFirst) {
        //console.log(`[Batch Sync] Deleting all existing words for user ${req.user._id}...`);
        const deleteResult = await Word.deleteMany({ userId: req.user._id });
        //console.log(`[Batch Sync] Deleted ${deleteResult.deletedCount} existing words`);

        // 检查新单词数量是否超过限制
        if (words.length > wordLimit) {
          return res.status(403).json({
            success: false,
            message: `Word limit exceeded. Maximum ${wordLimit} words allowed. Requested: ${words.length}`
          });
        }
      } else {
        // 增量插入模式，检查是否超过限制
        if (currentWordCount + words.length > wordLimit) {
          return res.status(403).json({
            success: false,
            message: `Word limit exceeded. Maximum ${wordLimit} words allowed. Current: ${currentWordCount}, Requested: ${words.length}`
          });
        }
      }

      // 批量插入新单词（分批处理避免超过MongoDB限制）
      // console.log('[Batch Sync] Preparing words for insertion...');
      const wordsToInsert = words.map(w => ({
        ...w,
        userId: req.user._id,
        word: w.word.toLowerCase()
      }));

      const BATCH_SIZE = 100; // 每批插入100条
      // console.log(`[Batch Sync] Inserting ${wordsToInsert.length} words in batches of ${BATCH_SIZE}...`);

      for (let i = 0; i < wordsToInsert.length; i += BATCH_SIZE) {
        const batch = wordsToInsert.slice(i, i + BATCH_SIZE);
        try {
          // ordered: false 允许跳过重复项继续插入
          const result = await Word.insertMany(batch, { ordered: false });
          created += result.length;
          // console.log(`[Batch Sync] Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}: ${result.length} words (total: ${created})`);
        } catch (error) {
          // 处理重复键错误
          if (error.code === 11000) {
            // 部分插入成功，计算成功插入的数量
            const insertedCount = error.insertedDocs ? error.insertedDocs.length : 0;
            created += insertedCount;
            // console.log(`[Batch Sync] Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${insertedCount} inserted, ${batch.length - insertedCount} duplicates skipped`);
          } else {
            throw error;
          }
        }
      }

      // console.log('[Batch Sync] All words inserted:', created);
    } else {
      // 合并模式：逐个处理
      // 先统计需要创建的新单词数量
      let newWordsCount = 0;
      const existingWords = await Word.find({ userId: req.user._id }).select('word').lean();
      const existingWordSet = new Set(existingWords.map(w => w.word));

      for (const wordData of words) {
        const wordKey = wordData.word.toLowerCase();
        if (!existingWordSet.has(wordKey)) {
          newWordsCount++;
        }
      }

      // console.log('[Batch Sync] New words to create:', newWordsCount, 'Existing words:', existingWords.length);

      // 检查是否会超过限制
      if (currentWordCount + newWordsCount > wordLimit) {
        return res.status(403).json({
          success: false,
          message: `Word limit exceeded. Maximum ${wordLimit} words allowed. Current: ${currentWordCount}, New words: ${newWordsCount}`
        });
      }

      for (const wordData of words) {
        const wordKey = wordData.word.toLowerCase();
        
        const existingWord = await Word.findOne({
          userId: req.user._id,
          word: wordKey
        });

        if (existingWord) {
          // 智能合并
          const merged = mergeWordData(existingWord, wordData);
          if (merged.hasChanges) {
            const updateData = { ...merged.data, updatedAt: Date.now() };
            delete updateData._id;
            delete updateData.__v;
            
            await Word.findOneAndUpdate(
              { userId: req.user._id, word: wordKey },
              { $set: updateData },
              { new: true }
            );
            updated++;
          } else {
            skipped++;
          }
        } else {
          // 创建新单词
          const wordToCreate = {
            ...wordData,
            userId: req.user._id,
            word: wordKey
          };

          // 将 statusHistory 转换成顶级字段
          if (wordToCreate.statusHistory && typeof wordToCreate.statusHistory === 'object') {
            ['1', '2', '3', '4', '5'].forEach(statusKey => {
              const statusEntry = wordToCreate.statusHistory[statusKey];
              if (statusEntry) {
                if (typeof statusEntry.createTime === 'number' && statusEntry.createTime > 0) {
                  wordToCreate[`state${statusKey}CreateTime`] = statusEntry.createTime;
                }
                if (typeof statusEntry.updateTime === 'number' && statusEntry.updateTime > 0) {
                  wordToCreate[`state${statusKey}UpdateTime`] = statusEntry.updateTime;
                }
              }
            });
          }

          await Word.create(wordToCreate);
          created++;
        }
      }
    }

    // 更新用户的条目数量
    if (created > 0 || (mode === 'replace' && clearFirst)) {
      if (mode === 'replace' && clearFirst) {
        req.user.wordCount = created;
      } else {
        req.user.wordCount += created;
      }
      req.user.updatedAt = new Date();
      await req.user.save();
    }

    res.status(200).json({
      success: true,
      message: 'Batch sync completed',
      stats: {
        total: words.length,
        created,
        updated,
        skipped
      }
    });
  } catch (error) {
    // console.error('Batch sync error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during batch sync',
      error: error.message
    });
  }
});

// 智能合并单词数据
function mergeWordData(existing, incoming) {
  let hasChanges = false;
  const merged = { ...existing.toObject() };

  // 合并翻译
  if (incoming.translations && Array.isArray(incoming.translations)) {
    const existingTranslations = new Set(merged.translations || []);
    incoming.translations.forEach(t => {
      if (t && t.trim() && !existingTranslations.has(t.trim())) {
        if (!merged.translations) merged.translations = [];
        merged.translations.push(t.trim());
        hasChanges = true;
      }
    });
  }

  // 合并标签
  if (incoming.tags && Array.isArray(incoming.tags)) {
    const existingTags = new Set(merged.tags || []);
    incoming.tags.forEach(tag => {
      if (tag && tag.trim() && !existingTags.has(tag.trim())) {
        if (!merged.tags) merged.tags = [];
        merged.tags.push(tag.trim());
        hasChanges = true;
      }
    });
  }

  // 合并例句
  if (incoming.sentences && Array.isArray(incoming.sentences)) {
    if (!merged.sentences) merged.sentences = [];
    const existingSentences = new Set(merged.sentences.map(s => s.sentence));
    incoming.sentences.forEach(sentenceObj => {
      if (sentenceObj && sentenceObj.sentence && !existingSentences.has(sentenceObj.sentence)) {
        merged.sentences.push(sentenceObj);
        hasChanges = true;
      }
    });
  }

  // 合并状态历史
  if (incoming.statusHistory && typeof incoming.statusHistory === 'object') {
    if (!merged.statusHistory) merged.statusHistory = {};
    Object.keys(incoming.statusHistory).forEach(key => {
      if (!merged.statusHistory[key]) {
        merged.statusHistory[key] = incoming.statusHistory[key];
        hasChanges = true;
      }
    });
  }

  // 使用最新的状态
  if (incoming.status && incoming.status !== merged.status) {
    merged.status = incoming.status;
    hasChanges = true;
  }

  if (incoming.language && incoming.language !== merged.language) {
    merged.language = incoming.language;
    hasChanges = true;
  }

  return { hasChanges, data: merged };
}

module.exports = router;


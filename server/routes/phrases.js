const express = require('express');
const router = express.Router();
const CustomPhrase = require('../models/CustomPhrase');
const { protect, checkSubscription } = require('../middleware/auth');

// 所有路由都需要认证和订阅验证
router.use(protect);
router.use(checkSubscription);

// @route   GET /api/phrases
// @desc    Get all custom phrases for current user
// @access  Private
router.get('/', async (req, res) => {
  try {
    const { status, language } = req.query;
    
    const filter = { userId: req.user._id };
    
    if (status) filter.status = status;
    if (language) filter.language = language;

    const phrases = await CustomPhrase.find(filter).sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      count: phrases.length,
      data: phrases
    });
  } catch (error) {
    // console.error('Get phrases error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/phrases/:word
// @desc    Get a single custom phrase
// @access  Private
router.get('/:word', async (req, res) => {
  try {
    const phrase = await CustomPhrase.findOne({
      userId: req.user._id,
      word: req.params.word.toLowerCase()
    });

    if (!phrase) {
      return res.status(404).json({
        success: false,
        message: 'Phrase not found'
      });
    }

    res.status(200).json({
      success: true,
      data: phrase
    });
  } catch (error) {
    // console.error('Get phrase error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/phrases
// @desc    Create or update a custom phrase
// @access  Private
router.post('/', async (req, res) => {
  try {
    const phraseData = req.body;
    
    // 确保 word 字段小写
    if (phraseData.word) {
      phraseData.word = phraseData.word.toLowerCase();
    }

    // 查找是否已存在
    let phrase = await CustomPhrase.findOne({
      userId: req.user._id,
      word: phraseData.word
    });

    if (phrase) {
      // 更新现有词组
      Object.assign(phrase, phraseData);
      phrase.updatedAt = Date.now();
      await phrase.save();
    } else {
      // 创建新词组
      phrase = await CustomPhrase.create({
        ...phraseData,
        userId: req.user._id
      });
    }

    res.status(200).json({
      success: true,
      data: phrase
    });
  } catch (error) {
    // console.error('Create/Update phrase error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   DELETE /api/phrases/:word
// @desc    Delete a custom phrase
// @access  Private
router.delete('/:word', async (req, res) => {
  try {
    const phrase = await CustomPhrase.findOneAndDelete({
      userId: req.user._id,
      word: req.params.word.toLowerCase()
    });

    if (!phrase) {
      return res.status(404).json({
        success: false,
        message: 'Phrase not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Phrase deleted successfully'
    });
  } catch (error) {
    console.error('Delete phrase error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/phrases/batch-sync
// @desc    Batch sync custom phrases
// @access  Private
router.post('/batch-sync', async (req, res) => {
  try {
    const { phrases, mode = 'merge' } = req.body;

    if (!Array.isArray(phrases)) {
      return res.status(400).json({
        success: false,
        message: 'Phrases must be an array'
      });
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;

    if (mode === 'replace') {
      // 完全替换：先删除所有现有词组
      // console.log(`[Batch Sync Phrases] Deleting all existing phrases for user ${req.user._id}...`);
      const deleteResult = await CustomPhrase.deleteMany({ userId: req.user._id });
      // console.log(`[Batch Sync Phrases] Deleted ${deleteResult.deletedCount} existing phrases`);

      // 批量插入新词组（分批处理避免超过MongoDB限制）
      const phrasesToInsert = phrases.map(p => ({
        ...p,
        userId: req.user._id,
        word: p.word.toLowerCase()
      }));

      const BATCH_SIZE = 100; // 每批插入100条
      // console.log(`[Batch Sync Phrases] Inserting ${phrasesToInsert.length} phrases in batches of ${BATCH_SIZE}...`);

      for (let i = 0; i < phrasesToInsert.length; i += BATCH_SIZE) {
        const batch = phrasesToInsert.slice(i, i + BATCH_SIZE);
        await CustomPhrase.insertMany(batch);
        created += batch.length;
        // console.log(`[Batch Sync Phrases] Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} phrases (total: ${created})`);
      }

      // console.log('[Batch Sync Phrases] All phrases inserted:', created);
    } else {
      // 合并模式：逐个处理
      for (const phraseData of phrases) {
        const wordKey = phraseData.word.toLowerCase();
        
        const existingPhrase = await CustomPhrase.findOne({
          userId: req.user._id,
          word: wordKey
        });

        if (existingPhrase) {
          // 更新
          Object.assign(existingPhrase, phraseData);
          existingPhrase.updatedAt = Date.now();
          await existingPhrase.save();
          updated++;
        } else {
          // 创建新词组
          await CustomPhrase.create({
            ...phraseData,
            userId: req.user._id,
            word: wordKey
          });
          created++;
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Batch sync completed',
      stats: {
        total: phrases.length,
        created,
        updated,
        skipped
      }
    });
  } catch (error) {
    // console.error('Batch sync phrases error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during batch sync',
      error: error.message
    });
  }
});

module.exports = router;


/**
 * Data Access Layer - 数据访问抽象层
 * 统一本地和云端数据访问接口，支持双写模式
 */

class DataAccessLayer {
  constructor() {
    this.mode = 'local'; // 'local' 或 'cloud'
    this.dualWrite = false; // 是否启用双写模式
  }

  /**
   * 初始化配置
   */
  async init() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['cloudConfig'], (result) => {
        if (result.cloudConfig) {
          // 兼容两种键名：cloudDbEnabled 和 enabled
          const isEnabled = result.cloudConfig.cloudDbEnabled || result.cloudConfig.enabled || false;
          this.mode = isEnabled ? 'cloud' : 'local';
          // 兼容两种键名：cloudDualWrite 和 dualWrite
          this.dualWrite = result.cloudConfig.cloudDualWrite !== false && result.cloudConfig.dualWrite !== false;
        }
        console.log(`[DataAccessLayer] Initialized - Mode: ${this.mode}, DualWrite: ${this.dualWrite}`);
        console.log(`[DataAccessLayer] Config:`, result.cloudConfig);
        resolve();
      });
    });
  }

  /**
   * 设置模式
   * 注意：不再使用此方法，改为直接在 options.html 中通过 checkbox 设置 cloudDbEnabled
   */
  async setMode(mode, dualWrite = true) {
    this.mode = mode;
    this.dualWrite = dualWrite;

    return new Promise((resolve) => {
      chrome.storage.local.get(['cloudConfig'], (result) => {
        const cloudConfig = result.cloudConfig || {};
        // 同时更新两个字段以保持兼容性
        cloudConfig.cloudDbEnabled = mode === 'cloud';
        cloudConfig.enabled = mode === 'cloud'; // 保留旧字段以兼容
        cloudConfig.cloudDualWrite = dualWrite;
        cloudConfig.dualWrite = dualWrite; // 保留旧字段以兼容

        chrome.storage.local.set({ cloudConfig }, () => {
          console.log(`[DataAccessLayer] Mode changed to: ${mode}, DualWrite: ${dualWrite}`);
          resolve();
        });
      });
    });
  }

  /**
   * 获取单词详情
   */
  async getWordDetails(word) {
    try {
      if (this.mode === 'cloud') {
        const response = await window.cloudAPI.getWord(word);
        return response.data || {};
      } else {
        return await this._sendToBackground('getWordDetails', { word });
      }
    } catch (error) {
      console.error('[DataAccessLayer] getWordDetails error:', error);
      // 云端失败时回退到本地
      if (this.mode === 'cloud') {
        console.log('[DataAccessLayer] Falling back to local database');
        return await this._sendToBackground('getWordDetails', { word });
      }
      throw error;
    }
  }

  /**
   * 获取所有单词详情
   */
  async getAllWordDetails() {
    try {
      if (this.mode === 'cloud') {
        const response = await window.cloudAPI.getAllWords();
        // 转换为 {word: data} 格式
        const details = {};
        if (response.data && Array.isArray(response.data)) {
          response.data.forEach(item => {
            details[item.word] = item;
          });
        }
        return details;
      } else {
        const response = await this._sendToBackground('getAllWordDetails', {});
        return response.details || {};
      }
    } catch (error) {
      console.error('[DataAccessLayer] getAllWordDetails error:', error);
      if (this.mode === 'cloud') {
        console.log('[DataAccessLayer] Falling back to local database');
        const response = await this._sendToBackground('getAllWordDetails', {});
        return response.details || {};
      }
      throw error;
    }
  }

  /**
   * 获取筛选后的单词详情（数据库层面筛选）
   * @param {Object} filters - 筛选条件
   * @param {string} filters.language - 语言筛选 ('all' 或具体语言)
   * @param {Array<number>} filters.statuses - 状态筛选数组 (空数组表示不筛选状态)
   * @param {number} filters.startDate - 开始日期时间戳 (可选)
   * @param {number} filters.endDate - 结束日期时间戳 (可选)
   * @param {boolean} filters.noDate - 是否只返回没有日期的单词 (可选)
   * @returns {Promise<Object>} - 返回 {word: details} 格式的对象
   */
  async getFilteredWordDetails(filters = {}) {
    try {
      if (this.mode === 'cloud') {
        // 云端模式：使用云端API的筛选功能
        const queryParams = {};

        // 语言筛选
        if (filters.language && filters.language !== 'all') {
          queryParams.language = filters.language;
        }

        // 状态筛选：支持多状态
        if (filters.statuses && filters.statuses.length > 0) {
          // 将状态数组转为逗号分隔的字符串
          queryParams.statuses = filters.statuses.join(',');
        }

        // 日期范围筛选
        if (filters.startDate !== undefined && filters.startDate !== null) {
          queryParams.startDate = filters.startDate;
        }
        if (filters.endDate !== undefined && filters.endDate !== null) {
          queryParams.endDate = filters.endDate;
        }

        console.log('[DataAccessLayer] Cloud query params:', queryParams);

        const response = await window.cloudAPI.getAllWords(queryParams);

        // 转换为 {word: data} 格式
        const details = {};
        if (response.data && Array.isArray(response.data)) {
          response.data.forEach(item => {
            // 如果需要筛选没有日期的单词（前端额外筛选）
            if (filters.noDate) {
              if (!item.statusHistory || !item.statusHistory['1'] || !item.statusHistory['1'].createTime) {
                details[item.word] = item;
              }
            } else {
              details[item.word] = item;
            }
          });
        }

        console.log('[DataAccessLayer] Cloud returned', Object.keys(details).length, 'words');
        return details;
      } else {
        // 本地模式：使用 background.js 的数据库层面筛选
        const response = await this._sendToBackground('getFilteredWordDetails', { filters });
        return response.details || {};
      }
    } catch (error) {
      console.error('[DataAccessLayer] getFilteredWordDetails error:', error);
      if (this.mode === 'cloud') {
        console.log('[DataAccessLayer] Falling back to local database');
        const response = await this._sendToBackground('getFilteredWordDetails', { filters });
        return response.details || {};
      }
      throw error;
    }
  }

  /**
   * 更新单词状态
   */
  async updateWordStatus(word, status, language, isCustom = false) {
    const wordData = {
      word,
      status,
      language,
      isCustom
    };

    try {
      // 双写模式：先写本地（快速响应）
      if (this.mode === 'cloud' && this.dualWrite) {
        // 异步写本地，不等待
        this._sendToBackground('updateWordStatus', { word, status, language, isCustom })
          .catch(err => console.error('[DataAccessLayer] Local write failed:', err));
      }

      // 主要写入
      if (this.mode === 'cloud') {
        await window.cloudAPI.saveWord(wordData);
      } else {
        await this._sendToBackground('updateWordStatus', { word, status, language, isCustom });
      }

      // 如果是本地模式但启用了双写，同步到云端
      if (this.mode === 'local' && this.dualWrite && window.cloudAPI.isEnabled) {
        window.cloudAPI.saveWord(wordData)
          .catch(err => console.error('[DataAccessLayer] Cloud sync failed:', err));
      }

      return { success: true };
    } catch (error) {
      console.error('[DataAccessLayer] updateWordStatus error:', error);
      throw error;
    }
  }

  /**
   * 添加翻译
   */
  async addTranslation(word, translation) {
    try {
      if (this.mode === 'cloud' && this.dualWrite) {
        this._sendToBackground('addTranslation', { word, translation })
          .catch(err => console.error('[DataAccessLayer] Local write failed:', err));
      }

      if (this.mode === 'cloud') {
        // 先获取现有数据
        const existing = await window.cloudAPI.getWord(word).catch(() => ({ data: null }));
        const translations = existing.data?.translations || [];
        if (!translations.includes(translation.trim())) {
          translations.push(translation.trim());
        }
        await window.cloudAPI.saveWord({ word, translations });
      } else {
        await this._sendToBackground('addTranslation', { word, translation });
      }

      if (this.mode === 'local' && this.dualWrite && window.cloudAPI.isEnabled) {
        const existing = await window.cloudAPI.getWord(word).catch(() => ({ data: null }));
        const translations = existing.data?.translations || [];
        if (!translations.includes(translation.trim())) {
          translations.push(translation.trim());
        }
        window.cloudAPI.saveWord({ word, translations })
          .catch(err => console.error('[DataAccessLayer] Cloud sync failed:', err));
      }

      return { success: true };
    } catch (error) {
      console.error('[DataAccessLayer] addTranslation error:', error);
      throw error;
    }
  }

  /**
   * 删除单词
   */
  async deleteWord(word) {
    try {
      if (this.mode === 'cloud' && this.dualWrite) {
        this._sendToBackground('deleteWord', { word })
          .catch(err => console.error('[DataAccessLayer] Local delete failed:', err));
      }

      if (this.mode === 'cloud') {
        await window.cloudAPI.deleteWord(word);
      } else {
        await this._sendToBackground('deleteWord', { word });
      }

      if (this.mode === 'local' && this.dualWrite && window.cloudAPI.isEnabled) {
        window.cloudAPI.deleteWord(word)
          .catch(err => console.error('[DataAccessLayer] Cloud sync failed:', err));
      }

      return { success: true };
    } catch (error) {
      console.error('[DataAccessLayer] deleteWord error:', error);
      throw error;
    }
  }

  /**
   * 批量同步（数据迁移）
   */
  async batchSync(words, mode = 'merge') {
    try {
      if (this.mode === 'cloud') {
        return await window.cloudAPI.batchSyncWords(words, mode);
      } else {
        // 本地批量导入
        return await this._sendToBackground('mergeDatabase', { backupData: words });
      }
    } catch (error) {
      console.error('[DataAccessLayer] batchSync error:', error);
      throw error;
    }
  }

  /**
   * 发送消息到 background
   */
  async _sendToBackground(action, data) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action, ...data }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else if (response && response.error) {
          reject(response.error);
        } else {
          resolve(response);
        }
      });
    });
  }
}

// 创建全局实例
const dataAccessLayer = new DataAccessLayer();

// 初始化
dataAccessLayer.init().catch(err => {
  console.error('[DataAccessLayer] Initialization failed:', err);
});

// 导出（非模块化环境）
if (typeof window !== 'undefined') {
  window.dataAccessLayer = dataAccessLayer;
}


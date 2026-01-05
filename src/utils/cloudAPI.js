/**
 * Lingkuma Cloud API Client
 * 云端数据库 API 客户端
 */

class CloudAPI {
  constructor() {
    // 官方认证服务器地址（硬编码）
    //https://dashboard.lingkuma.org
    //https://auth-lingkuma.chikai.de
    this.OFFICIAL_AUTH_SERVER = 'https://dashboard.lingkuma.org';

    this.authServerURL = '';  // 认证服务器地址
    this.dataServerURL = '';  // 数据服务器地址
    this.token = '';
    this.isEnabled = false;
    this.selfHosted = false;  // 是否自建服务器
  }

  /**
   * 初始化云端配置
   */
  async init() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['cloudConfig'], (result) => {
        if (result.cloudConfig) {
          this.selfHosted = result.cloudConfig.selfHosted || false;

          if (this.selfHosted) {
            // 自建服务器模式：使用用户配置的 serverURL
            const serverURL = result.cloudConfig.serverURL || '';
            this.authServerURL = serverURL;
            this.dataServerURL = serverURL;
          } else {
            // 官方服务器模式：使用硬编码的 auth 服务器 + 分配的 data 服务器
            this.authServerURL = this.OFFICIAL_AUTH_SERVER;
            this.dataServerURL = result.cloudConfig.dataServerURL || '';
          }

          this.token = result.cloudConfig.token || '';
          // 兼容两种键名：enabled 和 cloudDbEnabled
          this.isEnabled = result.cloudConfig.cloudDbEnabled || result.cloudConfig.enabled || false;
        }
        console.log('[CloudAPI] Initialized:', {
          selfHosted: this.selfHosted,
          authServerURL: this.authServerURL,
          dataServerURL: this.dataServerURL,
          hasToken: !!this.token,
          isEnabled: this.isEnabled
        });
        resolve();
      });
    });
  }

  /**
   * 保存云端配置
   * 注意：不要覆盖 cloudDbEnabled 和 cloudDualWrite，它们由 options.html 的自动保存管理
   */
  async saveConfig(config) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['cloudConfig'], (result) => {
        const currentConfig = result.cloudConfig || {};

        // 只更新传入的字段，保留其他字段
        const newConfig = {
          ...currentConfig,
          ...(config.authServerURL !== undefined && { authServerURL: config.authServerURL }),
          ...(config.dataServerURL !== undefined && { dataServerURL: config.dataServerURL }),
          ...(config.serverURL !== undefined && { serverURL: config.serverURL }),  // 兼容旧版
          ...(config.token !== undefined && { token: config.token }),
          ...(config.username !== undefined && { username: config.username })
        };

        // 更新实例变量
        this.baseURL = newConfig.serverURL || '';
        this.token = newConfig.token || '';
        this.isEnabled = newConfig.cloudDbEnabled || newConfig.enabled || false;

        console.log('[CloudAPI] Saving config:', newConfig);

        chrome.storage.local.set({ cloudConfig: newConfig }, resolve);
      });
    });
  }

  /**
   * 通用请求方法
   * @param {string} endpoint - API端点
   * @param {object} options - fetch选项
   * @param {string} serverType - 'auth' 或 'data'，默认为 'data'
   */
  async request(endpoint, options = {}, serverType = 'data') {
    const baseURL = serverType === 'auth' ? this.authServerURL : this.dataServerURL;

    if (!baseURL) {
      throw new Error(`${serverType === 'auth' ? 'Auth' : 'Data'} server URL not configured`);
    }

    const url = `${baseURL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `HTTP ${response.status}`);
    }

    return data;
  }

  /**
   * 用户注册
   */
  async register(username, email, password) {
    if (this.selfHosted) {
      // 自建服务器模式：使用原有的注册逻辑（直接连接数据服务器）
      const data = await this.request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password })
      }, 'data');

      if (data.success && data.data.token) {
        this.token = data.data.token;
        await this.saveConfig({
          token: this.token,
          username: username
        });
      }

      return data;
    } else {
      // 官方服务器模式：连接认证服务器，获取分配的数据服务器
      const data = await this.request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password })
      }, 'auth');

      if (data.success && data.data.token) {
        this.token = data.data.token;
        this.dataServerURL = data.data.dataServer;  // 保存分配的数据服务器地址

        await this.saveConfig({
          token: this.token,
          username: username,
          dataServerURL: data.data.dataServer
        });
      }

      return data;
    }
  }

  /**
   * 用户登录
   */
  async login(username, password) {
    if (this.selfHosted) {
      // 自建服务器模式：使用原有的登录逻辑（直接连接数据服务器）
      const data = await this.request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      }, 'data');

      if (data.success && data.data.token) {
        this.token = data.data.token;
        await this.saveConfig({
          token: this.token,
          username: username
        });
      }

      return data;
    } else {
      // 官方服务器模式：连接认证服务器，获取用户的数据服务器
      const data = await this.request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      }, 'auth');

      if (data.success && data.data.token) {
        this.token = data.data.token;
        this.dataServerURL = data.data.dataServer;  // 保存用户的数据服务器地址

        await this.saveConfig({
          token: this.token,
          username: username,
          dataServerURL: data.data.dataServer
        });
      }

      return data;
    }
  }

  /**
   * 获取当前用户信息
   */
  async getUserInfo() {
    return await this.request('/api/auth/me');
  }

  /**
   * 获取所有单词
   */
  async getAllWords(filters = {}) {
    const params = new URLSearchParams(filters);
    const query = params.toString() ? `?${params.toString()}` : '';
    return await this.request(`/api/words${query}`);
  }

  /**
   * 分页获取所有单词（用于大数据量下载）
   * @param {object} options - 配置选项
   * @param {number} options.limit - 每页数量，默认500
   * @param {function} options.onProgress - 进度回调 (downloaded, total) => void
   * @param {object} options.filters - 筛选条件
   * @returns {Promise<{success: boolean, data: Array, total: number}>}
   */
  async getAllWordsPaginated(options = {}) {
    const { limit = 500, onProgress = null, filters = {} } = options;
    const allWords = [];
    let page = 1;
    let total = 0;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        ...filters,
        page: page.toString(),
        limit: limit.toString()
      });

      const response = await this.request(`/api/words?${params.toString()}`);

      if (!response.success) {
        return { success: false, data: [], total: 0, error: response.message };
      }

      allWords.push(...response.data);
      total = response.total;
      hasMore = response.hasMore;

      // 调用进度回调
      if (onProgress && typeof onProgress === 'function') {
        onProgress(allWords.length, total);
      }

      console.log(`[CloudAPI] Paginated download: page ${page}, got ${response.data.length}, total ${allWords.length}/${total}`);

      page++;
    }

    return {
      success: true,
      data: allWords,
      total: total,
      count: allWords.length
    };
  }

  /**
   * 批量获取单词（只返回请求的单词）
   */
  async batchGetWords(words) {
    return await this.request('/api/words/batch-get', {
      method: 'POST',
      body: JSON.stringify({ words })
    });
  }

  /**
   * 获取单个单词
   */
  async getWord(word) {
    return await this.request(`/api/words/${encodeURIComponent(word)}`);
  }

  /**
   * 创建或更新单词
   */
  async saveWord(wordData) {
    return await this.request('/api/words', {
      method: 'POST',
      body: JSON.stringify(wordData)
    });
  }

  /**
   * 更新单词
   */
  async updateWord(word, updates) {
    return await this.request(`/api/words/${encodeURIComponent(word)}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  }

  /**
   * 删除单词
   */
  async deleteWord(word) {
    return await this.request(`/api/words/${encodeURIComponent(word)}`, {
      method: 'DELETE'
    });
  }

  /**
   * 批量同步单词
   */
  async batchSyncWords(words, mode = 'merge', clearFirst = false) {
    return await this.request('/api/words/batch-sync', {
      method: 'POST',
      body: JSON.stringify({ words, mode, clearFirst })
    });
  }

  /**
   * 获取所有自定义词组
   */
  async getAllPhrases(filters = {}) {
    const params = new URLSearchParams(filters);
    const query = params.toString() ? `?${params.toString()}` : '';
    return await this.request(`/api/phrases${query}`);
  }

  /**
   * 创建或更新自定义词组
   */
  async savePhrase(phraseData) {
    return await this.request('/api/phrases', {
      method: 'POST',
      body: JSON.stringify(phraseData)
    });
  }

  /**
   * 删除自定义词组
   */
  async deletePhrase(word) {
    return await this.request(`/api/phrases/${encodeURIComponent(word)}`, {
      method: 'DELETE'
    });
  }

  /**
   * 批量同步自定义词组
   */
  async batchSyncPhrases(phrases, mode = 'merge') {
    return await this.request('/api/phrases/batch-sync', {
      method: 'POST',
      body: JSON.stringify({ phrases, mode })
    });
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    return await this.request('/health');
  }

  /**
   * 绑定爱发电账号
   */
  async bindAfdian(afdianUserId) {
    return await this.request('/api/auth/bind-afdian', {
      method: 'POST',
      body: JSON.stringify({ afdianUserId })
    });
  }

  /**
   * 验证并刷新爱发电订阅状态
   */
  async verifyAfdian(afdianUserId) {
    const body = afdianUserId ? { afdianUserId } : {};
    return await this.request('/api/auth/verify-afdian', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }

  /**
   * 获取爱发电OAuth授权URL
   * @param {string} redirectUri - 回调URI（可选，默认使用官方服务器回调）
   * @returns {Promise<{success: boolean, data: {authUrl: string, state: string}}>}
   */
  async getAfdianAuthUrl(redirectUri, state) {
    const authServerUrl = this.OFFICIAL_AUTH_SERVER || 'https://lingkuma.org';
    const url = `${authServerUrl}/api/auth/afdian/authorize`;
    
    const params = new URLSearchParams();
    if (redirectUri) {
      params.append('redirect_uri', redirectUri);
    }
    if (state) {
      params.append('state', state);
    }
    
    const fullUrl = params.toString() ? `${url}?${params.toString()}` : url;
    
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    return await response.json();
  }

  /**
   * 处理爱发电OAuth回调（用于Chrome扩展）
   * @param {string} code - 授权码
   * @param {string} state - 状态参数
   * @param {string} redirectUri - 回调URI
   * @returns {Promise<{success: boolean, data: {token: string, username: string, isNewUser: boolean, afdianUserId: string}}>}
   */
  async handleAfdianCallback(code, state, redirectUri) {
    const authServerUrl = this.OFFICIAL_AUTH_SERVER || 'https://lingkuma.org';
    const url = `${authServerUrl}/api/auth/afdian/callback`;
    
    const params = new URLSearchParams({
      code,
      state,
      redirect_uri: redirectUri
    });
    
    const fullUrl = `${url}?${params.toString()}`;
    
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      redirect: 'manual'
    });
    
    // 对于Chrome扩展，回调会重定向到扩展URL，我们需要解析重定向
    if (response.type === 'opaqueredirect' || response.status === 302 || response.status === 301) {
      // 获取重定向URL
      const redirectUrl = response.headers.get('Location') || response.url;
      const urlObj = new URL(redirectUrl);
      
      return {
        success: true,
        data: {
          token: urlObj.searchParams.get('token'),
          username: urlObj.searchParams.get('username'),
          isNewUser: urlObj.searchParams.get('isNewUser') === 'true',
          afdianUserId: urlObj.searchParams.get('afdianUserId')
        }
      };
    }
    
    return await response.json();
  }
}

// 创建全局实例
const cloudAPI = new CloudAPI();

// 初始化
cloudAPI.init().catch(err => {
  console.error('[CloudAPI] Initialization failed:', err);
});

// 导出（非模块化环境）
if (typeof window !== 'undefined') {
  window.cloudAPI = cloudAPI;
}


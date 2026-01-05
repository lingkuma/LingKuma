const API_BASE = window.location.origin;

function getAPIBase() {
  const dataServer = localStorage.getItem('dataServer');
  return dataServer || API_BASE;
}

let currentPage = 1;
let pageSize = 10;
let totalPages = 1;
let totalWords = 0;
let currentFilters = {};
let filterMode = 'current';
let trendChart = null;
let isTrendVisible = false;
let statusPageMap = {};
let statusDataMap = {};
let selectedWords = new Set();

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  setupEventListeners();
  initializeDefaultDates();
  await applyFilters();
  loadTrendData();
});

async function checkAuth() {
  const token = localStorage.getItem('token');
  const username = localStorage.getItem('username');

  if (!token) {
    window.location.href = '/dashboard/register';
    return;
  }

  document.getElementById('username').textContent = username || 'User';

  try {
    const response = await fetch(`${API_BASE}/api/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      localStorage.removeItem('dataServer');
      window.location.href = '/dashboard/register';
      return;
    }

    document.getElementById('username').textContent = data.data.username;

    if (data.data.dataServer) {
      localStorage.setItem('dataServer', data.data.dataServer);
    }
  } catch (error) {
    console.error('Check auth error:', error);
  }
}

function setupEventListeners() {
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('applyFilterBtn').addEventListener('click', applyFilters);
  document.getElementById('clearFilterBtn').addEventListener('click', clearFilters);
  document.getElementById('prevBtn').addEventListener('click', prevPage);
  document.getElementById('nextBtn').addEventListener('click', nextPage);
  document.getElementById('pageSizeSelector').addEventListener('change', (e) => {
    pageSize = parseInt(e.target.value);
    currentPage = 1;
    loadWords();
  });
  document.getElementById('toggleTrendBtn').addEventListener('click', toggleTrend);
  
  document.querySelectorAll('.filter-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-mode-btn').forEach(b => {
        b.classList.remove('active');
      });
      btn.classList.add('active');
      filterMode = btn.dataset.value;
      currentPage = 1;
      statusPageMap = {};
      toggleFilterModeSections();
      applyFilters();
    });
  });
  
  document.getElementById('selectAllCheckbox').addEventListener('change', handleSelectAll);
  document.getElementById('deleteSelectedBtn').addEventListener('click', deleteSelectedWords);
  setupDateShortcutButtons();
  
  document.querySelectorAll('.status-checkbox-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.hasAttribute('checked')) {
        btn.removeAttribute('checked');
      } else {
        btn.setAttribute('checked', '');
      }
    });
  });
}

function toggleFilterModeSections() {
  const statsSection = document.getElementById('statsSection');
  const wordListSection = document.getElementById('wordListSection');
  const paginationSection = document.getElementById('paginationSection');
  const statusTabsSection = document.getElementById('statusTabsSection');

  if (filterMode === 'status') {
    statsSection.style.display = 'none';
    wordListSection.style.display = 'none';
    paginationSection.style.display = 'none';
    statusTabsSection.style.display = 'block';
  } else {
    statsSection.style.display = 'flex';
    wordListSection.style.display = 'block';
    paginationSection.style.display = 'flex';
    statusTabsSection.style.display = 'none';
  }
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  window.location.href = '/dashboard/register';
}

function initializeDefaultDates() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  const startDate = `${year}-${month}-01`;
  const endDate = `${year}-${month}-${day}`;

  document.getElementById('startDateFilter').value = startDate;
  document.getElementById('endDateFilter').value = endDate;
}

function setupDateShortcutButtons() {
  document.querySelectorAll('.date-shortcut-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const now = new Date();
      let startDate, endDate;

      switch (type) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'yesterday':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
          break;
        case 'thisWeek':
          const dayOfWeek = now.getDay();
          const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
          startDate = new Date(now.getFullYear(), now.getMonth(), diff);
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'thisMonth':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'lastDays':
          const days = parseInt(document.getElementById('lastDaysInput').value) || 30;
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1);
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
      }

      document.getElementById('startDateFilter').value = formatDateForInput(startDate);
      document.getElementById('endDateFilter').value = formatDateForInput(endDate);
      applyFilters();
    });
  });
}

function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildFilters() {
  const filters = {};

  const language = document.getElementById('languageFilter').value;
  if (language !== 'all') {
    filters.language = language;
  }

  const selectedStatuses = [];
  document.querySelectorAll('.status-checkbox-btn[checked]').forEach(btn => {
    selectedStatuses.push(btn.dataset.value);
  });
  if (selectedStatuses.length > 0) {
    filters.statuses = selectedStatuses.join(',');
  }

  const startDate = document.getElementById('startDateFilter').value;
  if (startDate) {
    filters.startDate = new Date(startDate).getTime();
  }

  const endDate = document.getElementById('endDateFilter').value;
  if (endDate) {
    filters.endDate = new Date(endDate).getTime() + 86400000 - 1;
  }

  return filters;
}

async function applyFilters() {
  currentFilters = buildFilters();
  currentPage = 1;
  statusPageMap = {};
  await loadWords();
  await loadTrendData();
}

async function clearFilters() {
  document.getElementById('languageFilter').value = 'all';
  document.querySelectorAll('.status-checkbox-btn').forEach(btn => {
    if (btn.dataset.value === '0') {
      btn.removeAttribute('checked');
    } else {
      btn.setAttribute('checked', '');
    }
  });
  initializeDefaultDates();
  await applyFilters();
}

async function loadWords() {
  const wordListEl = document.getElementById('wordList');
  wordListEl.innerHTML = '<div class="loading">加载中...</div>';

  try {
    if (filterMode === 'status') {
      await loadWordsByStatusTabs();
    } else {
      await loadWordsByCurrentStatus();
    }
  } catch (error) {
    console.error('Load words error:', error);
    wordListEl.innerHTML = '<div class="no-data">加载失败，请稍后重试</div>';
  }
}

async function loadWordsByCurrentStatus() {
  const wordListEl = document.getElementById('wordList');

  const params = new URLSearchParams({
    page: currentPage.toString(),
    limit: pageSize.toString(),
    ...currentFilters
  });

  const response = await fetch(`${getAPIBase()}/api/words?${params}`, {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });

  const data = await response.json();

  if (data.success) {
    totalWords = data.total || data.count;
    totalPages = data.totalPages || 1;
    displayWords(data.data);
    updateStats();
    updatePagination();
  } else {
    wordListEl.innerHTML = `<div class="no-data">${data.message || '加载失败'}</div>`;
  }
}

async function loadWordsByStatus() {
  const wordListEl = document.getElementById('wordList');

  const selectedStatuses = [];
  document.querySelectorAll('.status-checkbox-btn[checked]').forEach(btn => {
    selectedStatuses.push(btn.dataset.value);
  });

  if (selectedStatuses.length === 0) {
    wordListEl.innerHTML = '<div class="no-data">请至少选择一个状态</div>';
    return;
  }

  const params = new URLSearchParams({
    statuses: selectedStatuses.join(','),
    page: currentPage.toString(),
    limit: pageSize.toString()
  });

  const startDate = document.getElementById('startDateFilter').value;
  if (startDate) {
    params.append('startDate', new Date(startDate).getTime());
  }

  const endDate = document.getElementById('endDateFilter').value;
  if (endDate) {
    params.append('endDate', new Date(endDate).getTime() + 86400000 - 1);
  }

  const response = await fetch(`${getAPIBase()}/api/words/by-status?${params}`, {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });

  const data = await response.json();

  if (data.success) {
    totalWords = data.count;
    totalPages = data.totalPages || 1;
    displayWordsByStatus(data.data);
    updateStats();
    updatePagination();
  } else {
    wordListEl.innerHTML = `<div class="no-data">${data.message || '加载失败'}</div>`;
  }
}

async function loadWordsByStatusTabs() {
  const selectedStatuses = [];
  document.querySelectorAll('.status-checkbox-btn[checked]').forEach(btn => {
    selectedStatuses.push(btn.dataset.value);
  });

  if (selectedStatuses.length === 0) {
    document.getElementById('statusTabContent').innerHTML = '<div class="no-data">请至少选择一个状态</div>';
    return;
  }

  const startDate = document.getElementById('startDateFilter').value;
  const endDate = document.getElementById('endDateFilter').value;

  const params = new URLSearchParams({
    statuses: selectedStatuses.join(','),
    page: '1',
    limit: pageSize.toString()
  });

  if (startDate) {
    params.append('startDate', new Date(startDate).getTime());
  }

  if (endDate) {
    params.append('endDate', new Date(endDate).getTime() + 86400000 - 1);
  }

  const response = await fetch(`${getAPIBase()}/api/words/by-status?${params}`, {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });

  const data = await response.json();

  if (data.success) {
    statusDataMap = {};
    data.data.forEach(statusGroup => {
      statusDataMap[statusGroup.status] = {
        count: statusGroup.count,
        totalPages: statusGroup.totalPages || 1,
        currentPage: statusGroup.page || 1,
        words: statusGroup.words || []
      };
      statusPageMap[statusGroup.status] = statusGroup.page || 1;
    });
    renderStatusTabs();
    updateStats();
  }
}

function renderStatusTabs() {
  const tabsContainer = document.getElementById('statusTabs');
  const contentContainer = document.getElementById('statusTabContent');

  tabsContainer.innerHTML = '';
  contentContainer.innerHTML = '';

  const statusKeys = Object.keys(statusDataMap);

  statusKeys.forEach((status, index) => {
    const statusText = getStatusText(status);
    const statusData = statusDataMap[status];

    const tab = document.createElement('button');
    tab.className = `status-tab ${index === 0 ? 'active' : ''}`;
    tab.textContent = `${statusText} (${statusData.count} 个单词)`;
    tab.dataset.status = status;
    tab.addEventListener('click', () => switchStatusTab(status));
    tabsContainer.appendChild(tab);

    const tabContent = document.createElement('div');
    tabContent.className = `status-tab-pane ${index === 0 ? 'active' : ''}`;
    tabContent.dataset.status = status;

    const wordsHtml = statusData.words.map(word => {
      const stateCreateTimeField = `state${status}CreateTime`;
      const createTime = word[stateCreateTimeField] || word.createdAt;
      const date = createTime ? new Date(createTime).toLocaleDateString('zh-CN') : '-';

      return `
        <div class="word-item">
          <div class="word-item-header">
            <div>
              <div class="word-text">${word.word}</div>
              <div class="word-term">${word.term || ''}</div>
            </div>
            <div>
              <span class="word-language">${getLanguageText(word.language)}</span>
            </div>
            <div>
              <span class="word-date">${date}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    const paginationHtml = `
      <div class="status-pagination">
        <button class="btn btn-secondary status-prev-btn" data-status="${status}" ${statusData.currentPage <= 1 ? 'disabled' : ''}>上一页</button>
        <span>第 ${statusData.currentPage} 页 / 共 ${statusData.totalPages} 页</span>
        <button class="btn btn-secondary status-next-btn" data-status="${status}" ${statusData.currentPage >= statusData.totalPages ? 'disabled' : ''}>下一页</button>
      </div>
    `;

    tabContent.innerHTML = `
      <div class="status-word-list">${wordsHtml || '<div class="no-data">暂无数据</div>'}</div>
      ${paginationHtml}
    `;

    contentContainer.appendChild(tabContent);
  });

  document.querySelectorAll('.status-prev-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const status = e.target.dataset.status;
      statusPageMap[status] = (statusPageMap[status] || 1) - 1;
      if (statusPageMap[status] < 1) statusPageMap[status] = 1;
      loadStatusPage(status);
    });
  });

  document.querySelectorAll('.status-next-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const status = e.target.dataset.status;
      statusPageMap[status] = (statusPageMap[status] || 1) + 1;
      loadStatusPage(status);
    });
  });
}

async function loadStatusPage(status) {
  const startDate = document.getElementById('startDateFilter').value;
  const endDate = document.getElementById('endDateFilter').value;

  const params = new URLSearchParams({
    statuses: status,
    page: (statusPageMap[status] || 1).toString(),
    limit: pageSize.toString()
  });

  if (startDate) {
    params.append('startDate', new Date(startDate).getTime());
  }

  if (endDate) {
    params.append('endDate', new Date(endDate).getTime() + 86400000 - 1);
  }

  const response = await fetch(`${getAPIBase()}/api/words/by-status?${params}`, {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });

  const data = await response.json();

  if (data.success && data.data && data.data.length > 0) {
    const statusGroup = data.data[0];
    statusDataMap[status] = {
      count: statusGroup.count,
      totalPages: statusGroup.totalPages || 1,
      currentPage: statusGroup.page || 1,
      words: statusGroup.words || []
    };
    updateStatusTabContent(status);
  }
}

function updateStatusTabContent(status) {
  const statusData = statusDataMap[status];
  const tabPane = document.querySelector(`.status-tab-pane[data-status="${status}"]`);

  if (!tabPane || !statusData) return;

  const wordsHtml = statusData.words.map(word => {
    const stateCreateTimeField = `state${status}CreateTime`;
    const createTime = word[stateCreateTimeField] || word.createdAt;
    const date = createTime ? new Date(createTime).toLocaleDateString('zh-CN') : '-';

    return `
      <div class="word-item">
        <div class="word-item-header">
          <div>
            <div class="word-text">${word.word}</div>
            <div class="word-term">${word.term || ''}</div>
          </div>
          <div>
            <span class="word-language">${getLanguageText(word.language)}</span>
          </div>
          <div>
            <span class="word-date">${date}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const paginationHtml = `
    <div class="status-pagination">
      <button class="btn btn-secondary status-prev-btn" data-status="${status}" ${statusData.currentPage <= 1 ? 'disabled' : ''}>上一页</button>
      <span>第 ${statusData.currentPage} 页 / 共 ${statusData.totalPages} 页</span>
      <button class="btn btn-secondary status-next-btn" data-status="${status}" ${statusData.currentPage >= statusData.totalPages ? 'disabled' : ''}>下一页</button>
    </div>
  `;

  tabPane.innerHTML = `
    <div class="status-word-list">${wordsHtml || '<div class="no-data">暂无数据</div>'}</div>
    ${paginationHtml}
  `;

  const prevBtn = tabPane.querySelector('.status-prev-btn');
  const nextBtn = tabPane.querySelector('.status-next-btn');

  if (prevBtn) {
    prevBtn.addEventListener('click', (e) => {
      const status = e.target.dataset.status;
      statusPageMap[status] = (statusPageMap[status] || 1) - 1;
      if (statusPageMap[status] < 1) statusPageMap[status] = 1;
      loadStatusPage(status);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      const status = e.target.dataset.status;
      statusPageMap[status] = (statusPageMap[status] || 1) + 1;
      loadStatusPage(status);
    });
  }
}

function switchStatusTab(status) {
  document.querySelectorAll('.status-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.status === status);
  });

  document.querySelectorAll('.status-tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.dataset.status === status);
  });
}

function displayWords(words) {
  const wordListEl = document.getElementById('wordList');

  if (!words || words.length === 0) {
    wordListEl.innerHTML = '<div class="no-data">暂无数据</div>';
    updateSelectedCount();
    return;
  }

  wordListEl.innerHTML = words.map(word => {
    const statusText = getStatusText(word.status);
    const languageText = getLanguageText(word.language);
    const dateText = formatDate(word.createdAt);
    const isChecked = selectedWords.has(word.word) ? 'checked' : '';

    return `
      <div class="word-item" data-word="${word.word}">
        <div class="word-checkbox">
          <input type="checkbox" class="word-select" data-word="${word.word}" ${isChecked}>
        </div>
        <div class="word-item-header">
          <div>
            <div class="word-text">${word.word}</div>
            <div class="word-term">${word.term || ''}</div>
          </div>
          <div>
            <span class="word-language">${languageText}</span>
          </div>
          <div>
            <span class="word-status" data-status="${word.status}">${statusText}</span>
          </div>
          <div>
            <span class="word-date">${dateText}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  setupWordCheckboxListeners();
  updateSelectedCount();
}

function displayWordsByStatus(statusData) {
  const wordListEl = document.getElementById('wordList');

  if (!statusData || statusData.length === 0) {
    wordListEl.innerHTML = '<div class="no-data">暂无数据</div>';
    return;
  }

  let html = '';
  statusData.forEach(statusGroup => {
    const statusText = getStatusText(statusGroup.status);
    html += `<div class="status-group"><h4>状态: ${statusText} (${statusGroup.count} 个单词)</h4>`;
    
    if (statusGroup.words && statusGroup.words.length > 0) {
      html += statusGroup.words.map(word => {
        const languageText = getLanguageText(word.language);
        const stateCreateTimeField = `state${statusGroup.status}CreateTime`;
        const dateText = formatDate(word[stateCreateTimeField]);

        return `
          <div class="word-item">
            <div class="word-item-header">
              <div>
                <div class="word-text">${word.word}</div>
                <div class="word-term">${word.term || ''}</div>
              </div>
              <div>
                <span class="word-language">${languageText}</span>
              </div>
              <div>
                <span class="word-date">${dateText}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
    
    html += '</div>';
  });

  wordListEl.innerHTML = html;
}

function getStatusText(status) {
  const statusMap = {
    '0': '已归档',
    '1': '新词',
    '2': '学习中',
    '3': '眼熟的',
    '4': '熟练的',
    '5': '已知的'
  };
  return statusMap[status] || status;
}

function getLanguageText(language) {
  const languageMap = {
    'en': '英语',
    'ja': '日语',
    'ko': '韩语',
    'de': '德语',
    'fr': '法语',
    'es': '西班牙语',
    'ru': '俄语'
  };
  return languageMap[language] || language || '未知';
}

function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

function updateStats() {
  document.getElementById('totalWords').textContent = totalWords;
  document.getElementById('currentPage').textContent = currentPage;
  document.getElementById('totalPages').textContent = totalPages;
}

function updatePagination() {
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const pageInfo = document.getElementById('pageInfo');

  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;

  pageInfo.textContent = `第 ${currentPage} 页 / 共 ${totalPages} 页`;
}

function prevPage() {
  if (currentPage > 1) {
    currentPage--;
    loadWords();
  }
}

function nextPage() {
  if (currentPage < totalPages) {
    currentPage++;
    loadWords();
  }
}

function toggleTrend() {
  isTrendVisible = !isTrendVisible;
  const container = document.getElementById('trendChartContainer');
  container.style.display = isTrendVisible ? 'block' : 'none';
}

async function loadTrendData() {
  try {
    const params = new URLSearchParams();

    const language = document.getElementById('languageFilter').value;
    if (language !== 'all') {
      params.append('language', language);
    }

    const selectedStatuses = [];
    document.querySelectorAll('.status-checkbox-btn[checked]').forEach(btn => {
      selectedStatuses.push(btn.dataset.value);
    });

    if (filterMode === 'status' && selectedStatuses.length > 0) {
      params.append('statuses', selectedStatuses.join(','));
    }

    const startDate = document.getElementById('startDateFilter').value;
    if (startDate) {
      params.append('startDate', new Date(startDate).getTime());
    }

    const endDate = document.getElementById('endDateFilter').value;
    if (endDate) {
      params.append('endDate', new Date(endDate).getTime() + 86400000 - 1);
    }

    const response = await fetch(`${getAPIBase()}/api/words/trend?${params}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });

    const data = await response.json();

    if (data.success) {
      renderTrendChart(data.data);
    }
  } catch (error) {
    console.error('Load trend data error:', error);
  }
}

function renderTrendChart(trendData) {
  const ctx = document.getElementById('trendChart').getContext('2d');

  if (trendChart) {
    trendChart.destroy();
  }

  const colors = [
    { border: 'rgb(75, 192, 192)', bg: 'rgba(75, 192, 192, 0.2)' },
    { border: 'rgb(255, 99, 132)', bg: 'rgba(255, 99, 132, 0.2)' },
    { border: 'rgb(54, 162, 235)', bg: 'rgba(54, 162, 235, 0.2)' },
    { border: 'rgb(255, 206, 86)', bg: 'rgba(255, 206, 86, 0.2)' },
    { border: 'rgb(153, 102, 255)', bg: 'rgba(153, 102, 255, 0.2)' },
    { border: 'rgb(255, 159, 64)', bg: 'rgba(255, 159, 64, 0.2)' }
  ];

  let labels = [];
  let datasets = [];

  if (Array.isArray(trendData) && trendData.length > 0 && trendData[0].data !== undefined) {
    const allDates = new Set();
    trendData.forEach(statusGroup => {
      statusGroup.data.forEach(item => allDates.add(item.date));
    });
    labels = Array.from(allDates).sort();

    trendData.forEach((statusGroup, index) => {
      const statusText = getStatusText(statusGroup.status);
      const color = colors[index % colors.length];

      const dataMap = new Map(statusGroup.data.map(item => [item.date, item.count]));
      const values = labels.map(date => dataMap.get(date) || 0);

      datasets.push({
        label: statusText,
        data: values,
        borderColor: color.border,
        backgroundColor: color.bg,
        tension: 0.1,
        fill: false
      });
    });
  } else {
    labels = trendData.map(item => item.date);
    const values = trendData.map(item => item.count);

    datasets.push({
      label: '单词数量',
      data: values,
      borderColor: colors[0].border,
      backgroundColor: colors[0].bg,
      tension: 0.1,
      fill: true
    });
  }

  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top'
        },
        tooltip: {
          mode: 'index',
          intersect: false
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: '日期'
          }
        },
        y: {
          title: {
            display: true,
            text: '单词数量'
          },
          beginAtZero: true
        }
      }
    }
  });
}

function setupWordCheckboxListeners() {
  document.querySelectorAll('.word-select').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const word = e.target.dataset.word;
      if (e.target.checked) {
        selectedWords.add(word);
      } else {
        selectedWords.delete(word);
      }
      updateSelectedCount();
      updateSelectAllCheckbox();
    });
  });
}

function handleSelectAll(e) {
  const isChecked = e.target.checked;
  document.querySelectorAll('.word-select').forEach(checkbox => {
    checkbox.checked = isChecked;
    const word = checkbox.dataset.word;
    if (isChecked) {
      selectedWords.add(word);
    } else {
      selectedWords.delete(word);
    }
  });
  updateSelectedCount();
}

function updateSelectedCount() {
  const selectedCountEl = document.getElementById('selectedCount');
  const deleteBtn = document.getElementById('deleteSelectedBtn');
  selectedCountEl.textContent = `已选 ${selectedWords.size} 个`;
  deleteBtn.disabled = selectedWords.size === 0;
}

function updateSelectAllCheckbox() {
  const selectAllCheckbox = document.getElementById('selectAllCheckbox');
  const allCheckboxes = document.querySelectorAll('.word-select');
  if (allCheckboxes.length === 0) {
    selectAllCheckbox.checked = false;
    return;
  }
  const allChecked = Array.from(allCheckboxes).every(cb => cb.checked);
  const someChecked = Array.from(allCheckboxes).some(cb => cb.checked);
  selectAllCheckbox.checked = allChecked;
  selectAllCheckbox.indeterminate = someChecked && !allChecked;
}

async function deleteSelectedWords() {
  if (selectedWords.size === 0) {
    return;
  }

  if (!confirm(`确定要删除选中的 ${selectedWords.size} 个单词吗？`)) {
    return;
  }

  const deleteBtn = document.getElementById('deleteSelectedBtn');
  deleteBtn.disabled = true;
  deleteBtn.textContent = '删除中...';

  let successCount = 0;
  let failCount = 0;
  const wordsToDelete = Array.from(selectedWords);

  for (const word of wordsToDelete) {
    try {
      const response = await fetch(`${getAPIBase()}/api/words/${encodeURIComponent(word)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();
      if (data.success) {
        successCount++;
        selectedWords.delete(word);
      } else {
        failCount++;
      }
    } catch (error) {
      console.error(`Delete word "${word}" error:`, error);
      failCount++;
    }
  }

  deleteBtn.disabled = false;
  deleteBtn.textContent = '删除选中';

  if (failCount > 0) {
    alert(`删除完成：成功 ${successCount} 个，失败 ${failCount} 个`);
  }

  updateSelectedCount();
  loadWords();
}

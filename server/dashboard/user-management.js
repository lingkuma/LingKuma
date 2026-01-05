const API_BASE = '/api/admin';
let adminToken = '';
let currentPage = 1;
let totalPages = 1;
let currentFilters = {};
let selectedUserId = null;

async function login() {
  const passwordInput = document.getElementById('adminPassword');
  const adminPassword = passwordInput.value.trim();
  
  if (!adminPassword) {
    showMessage('请输入管理员密码', 'error');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ adminPassword })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      showMessage(data.message || '登录失败', 'error');
      return;
    }
    
    adminToken = data.data.token;
    localStorage.setItem('adminToken', adminToken);
    
    document.getElementById('loginPanel').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    
    loadStats();
    loadServers();
    loadUsers();
  } catch (error) {
    console.error('Login error:', error);
    showMessage('登录失败', 'error');
  }
}

function logout() {
  localStorage.removeItem('adminToken');
  adminToken = '';
  document.getElementById('loginPanel').style.display = 'block';
  document.getElementById('adminPanel').style.display = 'none';
  document.getElementById('adminPassword').value = '';
}

function checkLoginStatus() {
  const savedToken = localStorage.getItem('adminToken');
  if (savedToken) {
    adminToken = savedToken;
    
    fetch(`${API_BASE}/stats`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        document.getElementById('loginPanel').style.display = 'none';
        document.getElementById('adminPanel').style.display = 'block';
        loadStats();
        loadServers();
        loadUsers();
      } else {
        localStorage.removeItem('adminToken');
        showMessage('登录已过期，请重新登录', 'error');
      }
    })
    .catch(error => {
      console.error('Auto login error:', error);
      localStorage.removeItem('adminToken');
    });
  }
}

function showMessage(message, type = 'info') {
  const messageDiv = document.getElementById('message');
  messageDiv.innerHTML = `
    <div class="message ${type}">
      ${message}
    </div>
  `;
  
  setTimeout(() => {
    messageDiv.innerHTML = '';
  }, 5000);
}

async function loadStats() {
  try {
    const response = await fetch(`${API_BASE}/stats`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      showMessage(data.message || '加载统计信息失败', 'error');
      return;
    }

    document.getElementById('totalUsers').textContent = data.data.totalUsers;
    document.getElementById('activeUsers').textContent = data.data.totalUsers;
    document.getElementById('subscribedUsers').textContent = '-';
  } catch (error) {
    console.error('Load stats error:', error);
    showMessage('加载统计信息失败', 'error');
  }
}

async function loadServers() {
  try {
    const response = await fetch(`${API_BASE}/servers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      showMessage(data.message || '加载服务器列表失败', 'error');
      return;
    }

    const select = document.getElementById('filterDataServer');
    select.innerHTML = '<option value="">全部</option>';
    
    data.data.forEach(server => {
      const option = document.createElement('option');
      option.value = server.url;
      option.textContent = `${server.name} (${server.url})`;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Load servers error:', error);
    showMessage('加载服务器列表失败', 'error');
  }
}

async function loadUsers() {
  try {
    const params = new URLSearchParams();
    params.append('page', currentPage);
    
    if (currentFilters.username) {
      params.append('username', currentFilters.username);
    }
    
    if (currentFilters.email) {
      params.append('email', currentFilters.email);
    }
    
    if (currentFilters.afdianUserId) {
      params.append('afdianUserId', currentFilters.afdianUserId);
    }
    
    if (currentFilters.dataServer) {
      params.append('dataServer', currentFilters.dataServer);
    }
    
    if (currentFilters.subscriptionStatus) {
      params.append('subscriptionStatus', currentFilters.subscriptionStatus);
    }
    
    if (currentFilters.afdianPlanName) {
      params.append('afdianPlanName', currentFilters.afdianPlanName);
    }
    
    const response = await fetch(`${API_BASE}/users?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });
    
    const data = await response.json();

    if (!response.ok) {
      showMessage(data.message || '加载用户列表失败', 'error');
      return;
    }

    const tbody = document.getElementById('usersTableBody');
    
    if (data.data.users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="no-data">暂无用户</td></tr>';
      return;
    }

    tbody.innerHTML = data.data.users.map(user => {
      const storageUsed = user.wordCount || 0;
      const storageLimit = user.wordLimit || 20000;
      const storagePercent = storageLimit > 0 ? ((storageUsed / storageLimit) * 100).toFixed(1) : 0;
      
      let storageClass = '';
      if (storagePercent > 80) storageClass = 'danger';
      else if (storagePercent > 60) storageClass = 'warning';

      const subscriptionStatusClass = user.subscriptionStatus ? `status-${user.subscriptionStatus}` : 'status-pending';
      const subscriptionStatusText = user.subscriptionStatus === 'active' ? '活跃' : 
                                     user.subscriptionStatus === 'inactive' ? '未激活' : 
                                     user.subscriptionStatus === 'expired' ? '已过期' : '待定';

      return `
        <tr>
          <td class="user-info-cell">
            <div class="user-info-row"><strong>用户名:</strong> ${user.username || '-'}</div>
            <div class="user-info-row"><strong>邮箱:</strong> ${user.email || '-'}</div>
            <div class="user-info-row"><strong>Afdian ID:</strong> <code>${user.afdianUserId || '-'}</code></div>
          </td>
          <td><code>${user.dataServer || '-'}</code></td>
          <td><span class="status ${subscriptionStatusClass}">${subscriptionStatusText}</span></td>
          <td>${user.afdianPlanName ? `<span class="plan-badge">${user.afdianPlanName}</span>` : '-'}</td>
          <td>
            <div class="storage-bar">
              <div class="storage-fill ${storageClass}" style="width: ${storagePercent}%"></div>
            </div>
            <div class="storage-text">${storageUsed} / ${storageLimit} (${storagePercent}%)</div>
          </td>
          <td>${new Date(user.createdAt).toLocaleString('zh-CN')}</td>
          <td>
            <button class="btn btn-primary btn-small" onclick="showUserDetails('${user._id}')">查看</button>
            <button class="btn btn-danger btn-small" onclick="confirmDeleteUser('${user._id}')">删除</button>
          </td>
        </tr>
      `;
    }).join('');

    currentPage = data.data.pagination.page;
    totalPages = data.data.pagination.pages;
    
    document.getElementById('pageInfo').textContent = `第 ${currentPage} 页 / 共 ${totalPages} 页`;
    document.getElementById('prevPage').disabled = currentPage <= 1;
    document.getElementById('nextPage').disabled = currentPage >= totalPages;
  } catch (error) {
    console.error('Load users error:', error);
    showMessage('加载用户列表失败', 'error');
  }
}

function applyFilters() {
  currentFilters = {
    username: document.getElementById('filterUsername').value.trim(),
    email: document.getElementById('filterEmail').value.trim(),
    afdianUserId: document.getElementById('filterAfdianUserId').value.trim(),
    dataServer: document.getElementById('filterDataServer').value,
    subscriptionStatus: document.getElementById('filterSubscriptionStatus').value,
    afdianPlanName: document.getElementById('filterAfdianPlanName').value
  };
  
  currentPage = 1;
  loadUsers();
}

function resetFilters() {
  document.getElementById('filterUsername').value = '';
  document.getElementById('filterEmail').value = '';
  document.getElementById('filterAfdianUserId').value = '';
  document.getElementById('filterDataServer').value = '';
  document.getElementById('filterSubscriptionStatus').value = '';
  document.getElementById('filterAfdianPlanName').value = '';
  
  currentFilters = {};
  currentPage = 1;
  loadUsers();
}

function prevPage() {
  if (currentPage > 1) {
    currentPage--;
    loadUsers();
  }
}

function nextPage() {
  if (currentPage < totalPages) {
    currentPage++;
    loadUsers();
  }
}

async function showUserDetails(userId) {
  try {
    const response = await fetch(`${API_BASE}/users/${userId}`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });
    
    const data = await response.json();

    if (!response.ok) {
      showMessage(data.message || '加载用户详情失败', 'error');
      return;
    }

    selectedUserId = userId;
    const user = data.data;
    
    const storageUsed = user.wordCount || 0;
    const storageLimit = user.wordLimit || 20000;
    const storagePercent = storageLimit > 0 ? ((storageUsed / storageLimit) * 100).toFixed(1) : 0;
    
    let storageClass = '';
    if (storagePercent > 80) storageClass = 'danger';
    else if (storagePercent > 60) storageClass = 'warning';

    const modalBody = document.getElementById('userModalBody');
    modalBody.innerHTML = `
      <div class="form-group">
        <label>用户名</label>
        <input type="text" id="edit-username" value="${user.username || ''}" />
      </div>
      <div class="form-group">
        <label>邮箱</label>
        <input type="email" id="edit-email" value="${user.email || ''}" />
      </div>
      <div class="form-group">
        <label>Afdian ID</label>
        <input type="text" id="edit-afdianUserId" value="${user.afdianUserId || ''}" />
      </div>
      <div class="form-group">
        <label>数据服务器</label>
        <input type="text" id="edit-dataServer" value="${user.dataServer || ''}" />
      </div>
      <div class="form-group">
        <label>订阅状态</label>
        <select id="edit-subscriptionStatus">
          <option value="trial" ${user.subscriptionStatus === 'trial' ? 'selected' : ''}>试用</option>
          <option value="active" ${user.subscriptionStatus === 'active' ? 'selected' : ''}>活跃</option>
          <option value="inactive" ${user.subscriptionStatus === 'inactive' ? 'selected' : ''}>未激活</option>
          <option value="expired" ${user.subscriptionStatus === 'expired' ? 'selected' : ''}>已过期</option>
          <option value="localhost" ${user.subscriptionStatus === 'localhost' ? 'selected' : ''}>本地</option>
        </select>
      </div>
      <div class="form-group">
        <label>订阅到期时间</label>
        <input type="datetime-local" id="edit-subscriptionExpireAt" value="${user.subscriptionExpireAt ? new Date(user.subscriptionExpireAt).toISOString().slice(0, 16) : ''}" />
      </div>
      <div class="form-group">
        <label>订阅计划</label>
        <input type="text" id="edit-afdianPlanName" value="${user.afdianPlanName || ''}" placeholder="例如：贪吃熊_alpha" />
      </div>
      <div class="form-group">
        <label>存储使用</label>
        <div>
          <div class="storage-bar">
            <div class="storage-fill ${storageClass}" style="width: ${storagePercent}%"></div>
          </div>
          <div class="storage-text">${storageUsed} / ${storageLimit} (${storagePercent}%)</div>
        </div>
      </div>
      <div class="form-group">
        <label>存储限制</label>
        <input type="number" id="edit-wordLimit" value="${user.wordLimit || 20000}" />
      </div>
      <div class="form-group">
        <label>已用存储</label>
        <input type="number" id="edit-wordCount" value="${user.wordCount || 0}" />
      </div>
      <div class="form-group">
        <label>注册时间</label>
        <input type="text" value="${new Date(user.createdAt).toLocaleString('zh-CN')}" disabled />
      </div>
      <div class="form-group">
        <label>更新时间</label>
        <input type="text" value="${user.updatedAt ? new Date(user.updatedAt).toLocaleString('zh-CN') : '-'}" disabled />
      </div>
      <div class="form-group">
        <label>最后登录</label>
        <input type="text" value="${user.lastLogin ? new Date(user.lastLogin).toLocaleString('zh-CN') : '从未登录'}" disabled />
      </div>
      ${user.externalSubscription ? `
      <div class="form-group">
        <label>外部订阅平台</label>
        <input type="text" id="edit-externalPlatform" value="${user.externalSubscription.platform || ''}" />
      </div>
      <div class="form-group">
        <label>外部订阅用户ID</label>
        <input type="text" id="edit-externalUserId" value="${user.externalSubscription.userId || ''}" />
      </div>
      <div class="form-group">
        <label>最后验证时间</label>
        <input type="datetime-local" id="edit-lastVerified" value="${user.externalSubscription.lastVerified ? new Date(user.externalSubscription.lastVerified).toISOString().slice(0, 16) : ''}" />
      </div>
      <div class="form-group">
        <label>最后刷新时间</label>
        <input type="datetime-local" id="edit-lastRefreshTime" value="${user.externalSubscription.lastRefreshTime ? new Date(user.externalSubscription.lastRefreshTime).toISOString().slice(0, 16) : ''}" />
      </div>
      ` : ''}
    `;

    document.getElementById('userModal').classList.add('active');
  } catch (error) {
    console.error('Load user details error:', error);
    showMessage('加载用户详情失败', 'error');
  }
}

function closeUserModal() {
  document.getElementById('userModal').classList.remove('active');
  selectedUserId = null;
}

function confirmDeleteUser(userId) {
  selectedUserId = userId;
  
  if (confirm('确定要删除此用户吗？此操作不可恢复。')) {
    deleteUser();
  }
}

async function deleteUser() {
  if (!selectedUserId) {
    showMessage('未选择用户', 'error');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/users/${selectedUserId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      showMessage(data.message || '删除用户失败', 'error');
      return;
    }

    showMessage('用户删除成功', 'success');
    closeUserModal();
    loadStats();
    loadUsers();
  } catch (error) {
    console.error('Delete user error:', error);
    showMessage('删除用户失败', 'error');
  }
}

async function updateUser() {
  if (!selectedUserId) {
    showMessage('未选择用户', 'error');
    return;
  }
  
  const username = document.getElementById('edit-username')?.value;
  const email = document.getElementById('edit-email')?.value;
  const afdianUserId = document.getElementById('edit-afdianUserId')?.value;
  const dataServer = document.getElementById('edit-dataServer')?.value;
  const subscriptionStatus = document.getElementById('edit-subscriptionStatus')?.value;
  const subscriptionExpireAt = document.getElementById('edit-subscriptionExpireAt')?.value;
  const afdianPlanName = document.getElementById('edit-afdianPlanName')?.value;
  const wordLimit = document.getElementById('edit-wordLimit')?.value;
  const wordCount = document.getElementById('edit-wordCount')?.value;
  
  const externalPlatform = document.getElementById('edit-externalPlatform')?.value;
  const externalUserId = document.getElementById('edit-externalUserId')?.value;
  const lastVerified = document.getElementById('edit-lastVerified')?.value;
  const lastRefreshTime = document.getElementById('edit-lastRefreshTime')?.value;
  
  const externalSubscription = (externalPlatform || externalUserId || lastVerified || lastRefreshTime) ? {
    platform: externalPlatform || '',
    userId: externalUserId || '',
    lastVerified: lastVerified ? new Date(lastVerified) : undefined,
    lastRefreshTime: lastRefreshTime ? new Date(lastRefreshTime) : undefined
  } : undefined;
  
  const updateData = {
    username,
    email,
    afdianUserId,
    dataServer,
    subscriptionStatus,
    subscriptionExpireAt: subscriptionExpireAt ? new Date(subscriptionExpireAt) : undefined,
    afdianPlanName,
    wordLimit: wordLimit ? parseInt(wordLimit) : undefined,
    wordCount: wordCount ? parseInt(wordCount) : undefined,
    externalSubscription
  };
  
  try {
    const response = await fetch(`${API_BASE}/users/${selectedUserId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify(updateData)
    });

    const data = await response.json();

    if (!response.ok) {
      showMessage(data.message || '更新用户失败', 'error');
      return;
    }

    showMessage('用户更新成功，已同步到数据服务器', 'success');
    closeUserModal();
    loadUsers();
  } catch (error) {
    console.error('Update user error:', error);
    showMessage('更新用户失败', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  checkLoginStatus();
  
  const passwordInput = document.getElementById('adminPassword');
  passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      login();
    }
  });
});
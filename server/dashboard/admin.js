const API_BASE = window.location.origin;
let adminToken = '';

async function login() {
  const password = document.getElementById('adminPassword').value;
  
  if (!password) {
    showLoginMessage('请输入管理员密码', 'error');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ adminPassword: password })
    });

    const data = await response.json();

    if (!response.ok) {
      showLoginMessage(data.message || '登录失败', 'error');
      return;
    }

    adminToken = data.data.token;
    localStorage.setItem('adminToken', adminToken);
    
    await loadStats();
  } catch (error) {
    console.error('Login error:', error);
    showLoginMessage('登录失败', 'error');
  }
}

function logout() {
  localStorage.removeItem('adminToken');
  adminToken = '';
  document.getElementById('loginSection').style.display = 'block';
  document.getElementById('adminPanel').style.display = 'none';
  document.getElementById('adminPassword').value = '';
}

function checkLoginStatus() {
  const savedToken = localStorage.getItem('adminToken');
  if (savedToken) {
    adminToken = savedToken;
    
    fetch(`${API_BASE}/api/admin/stats`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('adminPanel').style.display = 'block';
        
        document.getElementById('totalUsers').textContent = data.data.totalUsers;
        document.getElementById('totalServers').textContent = data.data.totalServers;
        document.getElementById('activeServers').textContent = data.data.activeServers;
        
        loadServers();
      } else {
        localStorage.removeItem('adminToken');
        showLoginMessage(data.message || '登录已过期，请重新登录', 'error');
      }
    })
    .catch(error => {
      console.error('Auto login error:', error);
      localStorage.removeItem('adminToken');
    });
  }
}

function showLoginMessage(message, type) {
  const messageDiv = document.getElementById('loginMessage');
  messageDiv.innerHTML = `<div class="message message-${type}">${message}</div>`;
  setTimeout(() => {
    messageDiv.innerHTML = '';
  }, 3000);
}

function showMessage(message, type) {
  const messageDiv = document.getElementById('message');
  messageDiv.innerHTML = `<div class="message message-${type}">${message}</div>`;
  setTimeout(() => {
    messageDiv.innerHTML = '';
  }, 3000);
}

async function loadStats() {
  try {
    const response = await fetch(`${API_BASE}/api/admin/stats`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      showLoginMessage(data.message || '密码错误', 'error');
      return;
    }

    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';

    document.getElementById('totalUsers').textContent = data.data.totalUsers;
    document.getElementById('totalServers').textContent = data.data.totalServers;
    document.getElementById('activeServers').textContent = data.data.activeServers;

    loadServers();
  } catch (error) {
    console.error('Load stats error:', error);
    showLoginMessage('连接服务器失败', 'error');
  }
}

async function loadServers() {
  try {
    const response = await fetch(`${API_BASE}/api/admin/servers`, {
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

    const tbody = document.getElementById('serversTableBody');
    
    if (data.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: #999;">暂无服务器</td></tr>';
      return;
    }

    tbody.innerHTML = data.data.map(server => {
      const utilization = ((server.userCount / server.maxUsers) * 100).toFixed(1);
      let progressClass = '';
      if (utilization > 80) progressClass = 'danger';
      else if (utilization > 60) progressClass = 'warning';

      return `
        <tr>
          <td><strong>${server.name}</strong></td>
          <td><code>${server.url}</code></td>
          <td>${server.location || '-'}</td>
          <td>${server.userCount}</td>
          <td>
            <div class="progress-bar">
              <div class="progress-fill ${progressClass}" style="width: ${utilization}%"></div>
            </div>
            <small>${server.userCount} / ${server.maxUsers} (${utilization}%)</small>
          </td>
          <td><span class="status status-${server.status}">${getServerStatusText(server.status)}</span></td>
          <td><span class="status status-${server.available ? 'active' : 'inactive'}">${server.available ? '可用' : '不可用'}</span></td>
          <td><span class="status status-${server.healthStatus}">${getHealthStatusText(server.healthStatus)}</span></td>
          <td>${server.priority}</td>
          <td>
            <button class="btn btn-primary" onclick="showEditServerModal('${server._id}')">编辑</button>
            <button class="btn btn-success" onclick="healthCheckServer('${server._id}')">检查</button>
            <button class="btn btn-danger" onclick="deleteServer('${server._id}')">删除</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (error) {
    console.error('Load servers error:', error);
    showMessage('加载服务器列表失败', 'error');
  }
}

function getServerStatusText(status) {
  const statusMap = {
    'active': '活跃',
    'inactive': '不活跃',
    'maintenance': '维护中'
  };
  return statusMap[status] || status;
}

function getHealthStatusText(healthStatus) {
  const healthMap = {
    'healthy': '健康',
    'unhealthy': '不健康',
    'unknown': '未知'
  };
  return healthMap[healthStatus] || healthStatus;
}

async function healthCheckAll() {
  try {
    showMessage('正在执行健康检查...', 'success');
    
    const response = await fetch(`${API_BASE}/api/admin/servers/health-check-all`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      showMessage(data.message || '健康检查失败', 'error');
      return;
    }

    showMessage('健康检查完成', 'success');
    loadServers();
    loadStats();
  } catch (error) {
    console.error('Health check error:', error);
    showMessage('健康检查失败', 'error');
  }
}

async function healthCheckServer(serverId) {
  try {
    showMessage('正在检查服务器健康状态...', 'success');
    
    const response = await fetch(`${API_BASE}/api/admin/servers/${serverId}/health-check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      showMessage(data.message || '健康检查失败', 'error');
      return;
    }

    showMessage('健康检查完成', 'success');
    loadServers();
  } catch (error) {
    console.error('Health check server error:', error);
    showMessage('健康检查失败', 'error');
  }
}

function showAddServerModal() {
  document.getElementById('addServerModal').style.display = 'block';
}

function hideAddServerModal() {
  document.getElementById('addServerModal').style.display = 'none';
  document.getElementById('serverName').value = '';
  document.getElementById('serverUrl').value = '';
  document.getElementById('serverLocation').value = '';
  document.getElementById('serverMaxUsers').value = '10000';
  document.getElementById('serverPriority').value = '100';
}

async function addServer() {
  const name = document.getElementById('serverName').value.trim();
  const url = document.getElementById('serverUrl').value.trim();
  const location = document.getElementById('serverLocation').value.trim();
  const maxUsers = parseInt(document.getElementById('serverMaxUsers').value);
  const priority = parseInt(document.getElementById('serverPriority').value);

  if (!name || !url) {
    showMessage('请填写服务器名称和URL', 'error');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/admin/servers/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name,
        url,
        location,
        maxUsers,
        priority
      })
    });

    const data = await response.json();

    if (!response.ok) {
      showMessage(data.message || '添加服务器失败', 'error');
      return;
    }

    showMessage('服务器添加成功', 'success');
    hideAddServerModal();
    loadServers();
    loadStats();
  } catch (error) {
    console.error('Add server error:', error);
    showMessage('添加服务器失败', 'error');
  }
}

async function showEditServerModal(serverId) {
  try {
    const response = await fetch(`${API_BASE}/api/admin/servers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      showMessage(data.message || '获取服务器信息失败', 'error');
      return;
    }

    const server = data.data.find(s => s._id === serverId);
    if (!server) {
      showMessage('服务器不存在', 'error');
      return;
    }

    document.getElementById('editServerId').value = serverId;
    document.getElementById('editServerName').value = server.name;
    document.getElementById('editServerUrl').value = server.url;
    document.getElementById('editServerLocation').value = server.location || '';
    document.getElementById('editServerMaxUsers').value = server.maxUsers;
    document.getElementById('editServerPriority').value = server.priority;
    document.getElementById('editServerStatus').value = server.status;
    document.getElementById('editServerAvailable').value = server.available ? 'true' : 'false';

    document.getElementById('editServerModal').style.display = 'block';
  } catch (error) {
    console.error('Load server details error:', error);
    showMessage('获取服务器信息失败', 'error');
  }
}

function hideEditServerModal() {
  document.getElementById('editServerModal').style.display = 'none';
}

async function updateServer() {
  const serverId = document.getElementById('editServerId').value;
  const name = document.getElementById('editServerName').value.trim();
  const url = document.getElementById('editServerUrl').value.trim();
  const location = document.getElementById('editServerLocation').value.trim();
  const maxUsers = parseInt(document.getElementById('editServerMaxUsers').value);
  const priority = parseInt(document.getElementById('editServerPriority').value);
  const status = document.getElementById('editServerStatus').value;
  const available = document.getElementById('editServerAvailable').value === 'true';

  if (!name || !url) {
    showMessage('请填写服务器名称和URL', 'error');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/admin/servers/${serverId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name,
        url,
        location,
        maxUsers,
        priority,
        status,
        available
      })
    });

    const data = await response.json();

    if (!response.ok) {
      showMessage(data.message || '更新服务器失败', 'error');
      return;
    }

    showMessage('服务器更新成功', 'success');
    hideEditServerModal();
    loadServers();
  } catch (error) {
    console.error('Update server error:', error);
    showMessage('更新服务器失败', 'error');
  }
}

async function deleteServer(serverId) {
  if (!confirm('确定要删除此服务器吗？此操作不可恢复。')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/admin/servers/${serverId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      showMessage(data.message || '删除服务器失败', 'error');
      return;
    }

    showMessage('服务器删除成功', 'success');
    loadServers();
    loadStats();
  } catch (error) {
    console.error('Delete server error:', error);
    showMessage('删除服务器失败', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  checkLoginStatus();
  
  const passwordInput = document.getElementById('adminPassword');
  if (passwordInput) {
    passwordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        login();
      }
    });
  }

  window.onclick = function(event) {
    const addModal = document.getElementById('addServerModal');
    const editModal = document.getElementById('editServerModal');
    if (event.target === addModal) {
      hideAddServerModal();
    }
    if (event.target === editModal) {
      hideEditServerModal();
    }
  };
});

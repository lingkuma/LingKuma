const API_BASE = window.location.origin;

document.addEventListener('DOMContentLoaded', async () => {
    checkUrlParams();
    await loadUserInfo();
    
    document.getElementById('logoutBtn').addEventListener('click', logout);
});

function checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const username = urlParams.get('username');
    const dataServer = urlParams.get('dataServer');
    const afdianUserId = urlParams.get('afdianUserId');
    const afdianPlanName = urlParams.get('afdianPlanName');
    const wordLimit = urlParams.get('wordLimit');
    const wordCount = urlParams.get('wordCount');
    const subscriptionStatus = urlParams.get('subscriptionStatus');
    const subscriptionExpireAt = urlParams.get('subscriptionExpireAt');
    const isNewUser = urlParams.get('isNewUser');

    if (token) {
        localStorage.setItem('token', token);
    }
    if (username) {
        localStorage.setItem('username', username);
    }
    if (dataServer) {
        localStorage.setItem('dataServer', dataServer);
    }

    if (token && username && afdianUserId) {
        const oauthData = {
            token: token,
            username: username,
            isNewUser: isNewUser === 'true',
            afdianUserId: afdianUserId,
            dataServer: dataServer || '',
            afdianPlanName: afdianPlanName || '',
            wordLimit: wordLimit ? parseInt(wordLimit) : 20000,
            wordCount: wordCount ? parseInt(wordCount) : 0,
            subscriptionStatus: subscriptionStatus || '',
            subscriptionExpireAt: subscriptionExpireAt ? parseInt(subscriptionExpireAt) : null
        };

        const hiddenDiv = document.createElement('div');
        hiddenDiv.id = 'afdian-oauth-data';
        hiddenDiv.style.display = 'none';
        hiddenDiv.textContent = JSON.stringify(oauthData);
        document.body.appendChild(hiddenDiv);

        console.log('[Dashboard] OAuth data written to element:', oauthData);
    }

    if (token || username || dataServer) {
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
    }
}

async function loadUserInfo() {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');

    if (!token) {
        window.location.href = '/dashboard/register';
        return;
    }

    document.getElementById('username').textContent = username || '用户';

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
        console.error('Load user info error:', error);
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('dataServer');
    window.location.href = '/dashboard/register';
}

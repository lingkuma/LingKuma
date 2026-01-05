const API_BASE = window.location.origin;

document.addEventListener('DOMContentLoaded', async () => {
    await checkRegisterMode();
    await loadAvailableServers();
    setupAfdianOAuth();
});

let firstAvailableServerId = '';

async function loadAvailableServers() {
    try {
        const response = await fetch(`${API_BASE}/api/admin/servers/public`);
        const data = await response.json();
        
        const dataServerSelect = document.getElementById('dataServer');
        const oauthDataServerSelect = document.getElementById('oauthDataServer');
        
        if (data.success && data.data.servers && data.data.servers.length > 0) {
            const optionsHtml = '<option value="">请选择服务器</option>';
            
            data.data.servers.forEach(server => {
                if (server.available) {
                    const option = `<option value="${server._id}">${server.name} (${server.url})</option>`;
                    if (dataServerSelect) {
                        dataServerSelect.innerHTML += option;
                    }
                    if (oauthDataServerSelect) {
                        oauthDataServerSelect.innerHTML += option;
                    }
                }
            });
            
            if (dataServerSelect) {
                dataServerSelect.innerHTML = optionsHtml;
                data.data.servers.forEach(server => {
                    if (server.available) {
                        const option = document.createElement('option');
                        option.value = server._id;
                        option.textContent = `${server.name} (${server.url})`;
                        dataServerSelect.appendChild(option);
                    }
                });
            }
            
            if (oauthDataServerSelect) {
                oauthDataServerSelect.innerHTML = optionsHtml;
                data.data.servers.forEach(server => {
                    if (server.available) {
                        const option = document.createElement('option');
                        option.value = server._id;
                        option.textContent = `${server.name} (${server.url})`;
                        oauthDataServerSelect.appendChild(option);
                    }
                });
            }
            
            const availableServers = data.data.servers.filter(s => s.available);
            if (availableServers.length > 0) {
                firstAvailableServerId = availableServers[0]._id;
                if (oauthDataServerSelect) {
                    oauthDataServerSelect.value = firstAvailableServerId;
                }
            }
        } else {
            if (dataServerSelect) {
                dataServerSelect.innerHTML = '<option value="">暂无可用服务器</option>';
            }
            if (oauthDataServerSelect) {
                oauthDataServerSelect.innerHTML = '<option value="">暂无可用服务器</option>';
            }
        }
    } catch (error) {
        console.error('Failed to load available servers:', error);
        const dataServerSelect = document.getElementById('dataServer');
        const oauthDataServerSelect = document.getElementById('oauthDataServer');
        if (dataServerSelect) {
            dataServerSelect.innerHTML = '<option value="">加载服务器列表失败</option>';
        }
        if (oauthDataServerSelect) {
            oauthDataServerSelect.innerHTML = '<option value="">加载服务器列表失败</option>';
        }
    }
}

async function checkRegisterMode() {
    try {
        const response = await fetch(`${API_BASE}/api/config/register-mode`);
        const data = await response.json();
        
        const registerForm = document.getElementById('registerForm');
        const oauthSection = document.querySelector('.oauth-section');
        const divider = document.querySelector('.divider');
        const oauthServerGroup = document.getElementById('oauthServerGroup');
        const dataServerGroup = document.getElementById('dataServer')?.parentElement;
        
        if (data.registerMode === 'local') {
            // local 模式：显示用户名/密码注册表单
            registerForm.style.display = 'block';
            if (oauthSection) {
                oauthSection.style.display = 'block';
                if (divider) divider.style.display = 'block';
            }
            if (oauthServerGroup) {
                oauthServerGroup.style.display = 'none';
            }
        } else {
            // 非 local 模式：只显示爱发电登录，隐藏用户名/密码注册表单
            registerForm.style.display = 'none';
            if (oauthSection) {
                oauthSection.style.display = 'block';
                if (divider) divider.style.display = 'none';
            }
            if (oauthServerGroup) {
                oauthServerGroup.style.display = 'block';
            }
        }
    } catch (error) {
        console.error('Failed to check register mode:', error);
    }
}

function setupAfdianOAuth() {
    const afdianLoginBtn = document.getElementById('afdianLoginBtn');
    if (!afdianLoginBtn) return;
    
    afdianLoginBtn.addEventListener('click', async () => {
        const oauthDataServer = document.getElementById('oauthDataServer');
        const selectedServerId = oauthDataServer ? oauthDataServer.value : '';
        
        if (!selectedServerId) {
            showMessage('请先选择数据服务器', 'error');
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE}/api/auth/afdian/authorize?state=${encodeURIComponent(selectedServerId)}`);
            const data = await response.json();
            
            if (data.success && data.data.authUrl) {
                window.location.href = data.data.authUrl;
            } else {
                showMessage('获取授权链接失败', 'error');
            }
        } catch (error) {
            console.error('Afdian OAuth error:', error);
            showMessage('授权失败，请稍后重试', 'error');
        }
    });
}

document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const afdianUserId = document.getElementById('afdianUserId').value.trim();
    const dataServer = document.getElementById('dataServer').value;
    
    if (password.length < 6) {
        showMessage('密码至少需要6个字符', 'error');
        return;
    }
    
    if (!dataServer) {
        showMessage('请选择数据服务器', 'error');
        return;
    }
    
    const registerBtn = document.getElementById('registerBtn');
    const btnText = registerBtn.querySelector('.btn-text');
    const btnLoading = registerBtn.querySelector('.btn-loading');
    
    registerBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';
    
    try {
        const requestBody = { username, email, password, dataServer };
        if (afdianUserId) {
            requestBody.afdianUserId = afdianUserId;
        }
        
        const response = await fetch(`${API_BASE}/api/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('注册成功！正在跳转...', 'success');
            
            const token = data.data.token;
            localStorage.setItem('token', token);
            localStorage.setItem('username', data.data.username);
            localStorage.setItem('dataServer', data.data.dataServer || '');
            
            setTimeout(() => {
                window.location.href = '/dashboard/index';
            }, 1000);
        } else {
            showMessage(data.message || '注册失败', 'error');
        }
    } catch (error) {
        console.error('Register error:', error);
        showMessage('注册失败，请稍后重试', 'error');
    } finally {
        registerBtn.disabled = false;
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
    }
});

function showMessage(message, type) {
    const messageDiv = document.getElementById('message');
    messageDiv.innerHTML = `<div class="message-${type}">${message}</div>`;
    messageDiv.style.display = 'block';
    
    if (type === 'success') {
        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 3000);
    }
}

const canvas = document.getElementById('particleCanvas');
const ctx = canvas.getContext('2d');

let particles = [];
const particleCount = 100;
const connectionDistance = 150;

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function createParticle() {
    return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        radius: Math.random() * 2 + 1
    };
}

function initParticles() {
    particles = [];
    for (let i = 0; i < particleCount; i++) {
        particles.push(createParticle());
    }
}

function updateParticles() {
    particles.forEach(particle => {
        particle.x += particle.vx;
        particle.y += particle.vy;

        if (particle.x < 0 || particle.x > canvas.width) {
            particle.vx *= -1;
        }
        if (particle.y < 0 || particle.y > canvas.height) {
            particle.vy *= -1;
        }
    });
}

function drawParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach((particle, i) => {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(102, 126, 234, 0.6)';
        ctx.fill();

        for (let j = i + 1; j < particles.length; j++) {
            const other = particles[j];
            const dx = particle.x - other.x;
            const dy = particle.y - other.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < connectionDistance) {
                ctx.beginPath();
                ctx.moveTo(particle.x, particle.y);
                ctx.lineTo(other.x, other.y);
                ctx.strokeStyle = `rgba(102, 126, 234, ${0.3 * (1 - distance / connectionDistance)})`;
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }
    });
}

function animate() {
    updateParticles();
    drawParticles();
    requestAnimationFrame(animate);
}

window.addEventListener('resize', () => {
    resizeCanvas();
    initParticles();
});

resizeCanvas();
initParticles();
animate();

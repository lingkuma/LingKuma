async function setStorageValue(key, value) {
  // 使用 browser API 或 chrome API（Firefox 兼容性）
  const storageAPI = typeof browser !== 'undefined' ? browser : chrome;
  return new Promise((resolve) => {
    storageAPI.storage.local.set({ [key]: value }, () => {
      resolve();
    });
  });
}

async function getStorageValue(key) {
  const storageAPI = typeof browser !== 'undefined' ? browser : chrome;
  return new Promise((resolve) => {
    storageAPI.storage.local.get(key, (result) => {
      resolve(result[key]);
    });
  });
}

async function getAfdianUserId() {
  const result = await getStorageValue('subscriptionConfig');
  if (!result) {
    return null;
  }
  return result.afdianUserId || null;
}

async function triggerSubscriptionRefresh() {
  try {
    const afdianUserId = await getAfdianUserId();
    if (!afdianUserId) {
      console.log('[a0_afdian] No Afdian user ID found, skipping refresh');
      return null;
    }

    const runtimeAPI = typeof browser !== 'undefined' ? browser : chrome;
    return new Promise((resolve) => {
      runtimeAPI.runtime.sendMessage(
        { action: 'refreshAfdianSubscription', afdianUserId },
        (response) => {
          resolve(response);
        }
      );
    });
  } catch (error) {
    console.error('[a0_afdian] Error triggering refresh:', error);
    return null;
  }
}

function showSubscriptionStatusNotification(message, type = 'info') {
  const existingNotification = document.getElementById('subscription-notification');
  if (existingNotification) {
    existingNotification.remove();
  }

  const notification = document.createElement('div');
  notification.id = 'subscription-notification';

  const colors = {
    info: 'linear-gradient(135deg, #0984e3, #74b9ff)',
    warning: 'linear-gradient(135deg, #fdcb6e, #e17055)',
    success: 'linear-gradient(135deg, #00b894, #55efc4)',
    error: 'linear-gradient(135deg, #d63031, #ff7675)'
  };

  const icons = {
    info: '⏳',
    warning: '⚠️',
    success: '✅',
    error: '❌'
  };

  notification.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 999999;
    background: ${colors[type]};
    color: white;
    padding: 16px 24px;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 12px;
    animation: slideDown 0.3s ease-out;
    max-width: 90%;
    word-wrap: break-word;
  `;

  const icon = document.createElement('span');
  icon.innerHTML = icons[type];
  icon.style.cssText = 'font-size: 20px;';

  const text = document.createElement('span');
  text.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '×';
  closeBtn.style.cssText = `
    background: rgba(255, 255, 255, 0.2);
    border: none;
    color: white;
    font-size: 20px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    margin-left: 8px;
    transition: background 0.2s;
  `;
  closeBtn.onmouseenter = () => closeBtn.style.background = 'rgba(255, 255, 255, 0.3)';
  closeBtn.onmouseleave = () => closeBtn.style.background = 'rgba(255, 255, 255, 0.2)';
  closeBtn.onclick = () => notification.remove();

  notification.appendChild(icon);
  notification.appendChild(text);
  notification.appendChild(closeBtn);

  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateX(-50%) translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    }
    @keyframes fadeOut {
      from {
        opacity: 1;
      }
      to {
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(notification);

  setTimeout(() => {
    if (notification.parentElement) {
      notification.style.animation = 'fadeOut 0.3s ease-out forwards';
      setTimeout(() => notification.remove(), 300);
    }
  }, 8000);
}

async function checkAndRefreshSubscription() {
  try {
    const now = new Date();
    const storageAPI = typeof browser !== 'undefined' ? browser : chrome;
    const runtimeAPI = typeof browser !== 'undefined' ? browser : chrome;

    const storageResult = await new Promise(resolve => {
      storageAPI.storage.local.get(['cloudConfig', 'subscriptionConfig'], resolve);
    });

    const subscriptionExpireAt = storageResult.cloudConfig?.subscriptionExpireAt || storageResult.subscriptionConfig?.subscriptionExpireAt;

    if (!subscriptionExpireAt) {
      console.log('[a0_afdian] No subscription expiration time found, skipping check');
      return;
    }

    const expireDate = new Date(subscriptionExpireAt);
    console.log('[a0_afdian] Local expiration time:', expireDate.toLocaleString());

    if (now < expireDate) {
      console.log('[a0_afdian] Subscription is valid, no refresh needed');
      return;
    }

    console.log('[a0_afdian] Subscription expired, attempting to refresh...');

    showSubscriptionStatusNotification('订阅已到期，正在自动更新...', 'warning');

    const refreshResponse = await new Promise((resolve) => {
      runtimeAPI.runtime.sendMessage(
        { action: 'refreshAfdianSubscription' },
        (response) => {
          resolve(response);
        }
      );
    });

    if (refreshResponse?.success) {
      if (refreshResponse.subscriptionExpireAt) {
        await new Promise(resolve => {
          storageAPI.storage.local.get(['cloudConfig'], (result) => {
            const cloudConfig = result.cloudConfig || {};
            cloudConfig.subscriptionExpireAt = refreshResponse.subscriptionExpireAt;
            cloudConfig.subscriptionStatus = 'active';
            storageAPI.storage.local.set({ cloudConfig }, resolve);
          });
        });
        console.log('[a0_afdian] Updated local subscriptionExpireAt to:', new Date(refreshResponse.subscriptionExpireAt).toLocaleString());

        const expireDate = new Date(refreshResponse.subscriptionExpireAt).toLocaleDateString();
        showSubscriptionStatusNotification(`✅ 订阅状态已更新，新到期时间：${expireDate}`, 'success');
      } else {
        showSubscriptionStatusNotification(`✅ 订阅状态已更新`, 'success');
      }
    } else {
      console.log('[a0_afdian] Refresh failed:', refreshResponse?.message);
      showSubscriptionStatusNotification(`❌ 自动续期失败：${refreshResponse?.message || '未知错误'}`, 'error');
    }
  } catch (error) {
    console.error('[a0_afdian] Error during check and refresh:', error);
    showSubscriptionStatusNotification(`❌ 自动续期失败：${error.message}`, 'error');
  }
}

checkAndRefreshSubscription();

function processOAuthData(oauthDataElement) {
  try {
    const oauthDataText = oauthDataElement.textContent;
    console.log('[a0_afdian] Found OAuth data element');

    try {
      const oauthData = JSON.parse(oauthDataText);
      console.log('[a0_afdian] Parsed OAuth data:', oauthData);

      if (oauthData.token && oauthData.username) {
        const cloudConfig = {
          token: oauthData.token,
          username: oauthData.username,
          selfHosted: false,
          cloudDbEnabled: true,
          afdianUserId: oauthData.afdianUserId || '',
          dataServer: oauthData.dataServer || '',
          dataServerURL: oauthData.dataServer || '',
          afdianPlanName: oauthData.afdianPlanName || '',
          wordLimit: oauthData.wordLimit || 20000,
          wordCount: oauthData.wordCount || 0,
          subscriptionStatus: oauthData.subscriptionStatus || '',
          subscriptionExpireAt: oauthData.subscriptionExpireAt || null
        };

        const storageAPI = typeof browser !== 'undefined' ? browser : chrome;
        const runtimeAPI = typeof browser !== 'undefined' ? browser : chrome;

        storageAPI.storage.local.set({ cloudConfig }, () => {
          const lastError = runtimeAPI.runtime.lastError;
          if (lastError) {
            console.error('[a0_afdian] Storage error:', lastError);
          } else {
            console.log('[a0_afdian] OAuth data saved successfully');
            showSubscriptionStatusNotification('登录成功！', 'success');
          }
        });

        return true;
      }
    } catch (parseError) {
      console.error('[a0_afdian] Failed to parse OAuth data:', parseError);
    }
  } catch (error) {
    console.error('[a0_afdian] Error processing OAuth data:', error);
  }
  return false;
}

function checkAndSaveOAuthData() {
  try {
    const oauthDataElement = document.getElementById('afdian-oauth-data');

    if (oauthDataElement) {
      const processed = processOAuthData(oauthDataElement);
      if (processed && oauthObserver) {
        oauthObserver.disconnect();
        oauthObserver = null;
        console.log('[a0_afdian] Observer disconnected after processing');
      }
      return;
    }

    console.log('[a0_afdian] OAuth data element not found yet, waiting...');
  } catch (error) {
    console.error('[a0_afdian] Error checking OAuth data:', error);
  }
}

let oauthObserver = null;

function setupOAuthObserver() {
  checkAndSaveOAuthData();

  if (document.getElementById('afdian-oauth-data')) {
    return;
  }

  // 确保 body 存在
  if (!document.body) {
    console.log('[a0_afdian] document.body not ready, waiting...');
    setTimeout(setupOAuthObserver, 100);
    return;
  }

  oauthObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1 && node.id === 'afdian-oauth-data') {
          console.log('[a0_afdian] OAuth data element detected via MutationObserver');
          const processed = processOAuthData(node);
          if (processed && oauthObserver) {
            oauthObserver.disconnect();
            oauthObserver = null;
            console.log('[a0_afdian] Observer disconnected');
          }
          return;
        }
      }
    }
  });

  oauthObserver.observe(document.body, {
    childList: true,
    subtree: true
  });

  console.log('[a0_afdian] MutationObserver set up to watch for OAuth data element');

  setTimeout(() => {
    if (oauthObserver) {
      oauthObserver.disconnect();
      oauthObserver = null;
      console.log('[a0_afdian] Observer timeout, disconnecting');
    }
  }, 10000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupOAuthObserver);
} else {
  setupOAuthObserver();
}

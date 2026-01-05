const { signServerRequest } = require('../middleware/serverAuth');

async function syncUserToServer(serverUrl, userData) {
  try {
    const path = '/api/server-sync/sync-user';
    const headers = signServerRequest('POST', path, { userData });

    const response = await fetch(`${serverUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify({ userData })
    });

    const result = await response.json();

    if (result.success) {
      // console.log(`[ServerSync] User synced to ${serverUrl}:`, result.data);
      return { success: true, data: result.data };
    } else {
      // console.error(`[ServerSync] Failed to sync user to ${serverUrl}:`, result.message);
      return { success: false, message: result.message };
    }
  } catch (error) {
    // console.error(`[ServerSync] Error syncing user to ${serverUrl}:`, error);
    return { success: false, message: error.message };
  }
}

async function syncUserStatsToServer(serverUrl, username, stats) {
  try {
    const path = '/api/server-sync/sync-user-stats';
    const headers = signServerRequest('POST', path, { username, ...stats });

    const response = await fetch(`${serverUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify({ username, ...stats })
    });

    const result = await response.json();

    if (result.success) {
      // console.log(`[ServerSync] User stats synced to ${serverUrl}:`, result.data);
      return { success: true, data: result.data };
    } else {
      // console.error(`[ServerSync] Failed to sync user stats to ${serverUrl}:`, result.message);
      return { success: false, message: result.message };
    }
  } catch (error) {
    // console.error(`[ServerSync] Error syncing user stats to ${serverUrl}:`, error);
    return { success: false, message: error.message };
  }
}

async function getUserFromServer(serverUrl, username) {
  try {
    const path = `/api/server-sync/user/${encodeURIComponent(username)}`;
    const headers = signServerRequest('GET', path, {});

    const response = await fetch(`${serverUrl}${path}`, {
      method: 'GET',
      headers
    });

    const result = await response.json();

    if (result.success) {
      return { success: true, data: result.data };
    } else {
      return { success: false, message: result.message };
    }
  } catch (error) {
    // console.error(`[ServerSync] Error getting user from ${serverUrl}:`, error);
    return { success: false, message: error.message };
  }
}

async function syncUserConfigToServer(serverUrl, username, userConfig) {
  try {
    const path = '/api/server-sync/sync-user-config';
    const headers = signServerRequest('POST', path, { username, ...userConfig });

    const response = await fetch(`${serverUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify({ username, ...userConfig })
    });

    const result = await response.json();

    if (result.success) {
      // console.log(`[ServerSync] User config synced to ${serverUrl}:`, result.data);
      return { success: true, data: result.data };
    } else {
      // console.error(`[ServerSync] Failed to sync user config to ${serverUrl}:`, result.message);
      return { success: false, message: result.message };
    }
  } catch (error) {
    // console.error(`[ServerSync] Error syncing user config to ${serverUrl}:`, error);
    return { success: false, message: error.message };
  }
}

module.exports = {
  syncUserToServer,
  syncUserStatsToServer,
  getUserFromServer,
  syncUserConfigToServer
};

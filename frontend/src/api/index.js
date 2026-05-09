const BASE = '/api';

export class PermissionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PermissionError';
  }
}

function getToken() {
  return localStorage.getItem('ds_token');
}

// Гарантирует однократный диспатч ds:unauthorized при каскадных 401
let _unauthorizedFired = false;
function fireUnauthorized() {
  if (_unauthorizedFired) return;
  _unauthorizedFired = true;
  window.dispatchEvent(new CustomEvent('ds:unauthorized'));
  // Сбрасываем флаг после того как React обработает событие
  setTimeout(() => { _unauthorizedFired = false; }, 2000);
}

async function req(method, path, body, isFormData = false, deviceToken = null) {
  const opts = { method, headers: {} };
  const jwtToken = deviceToken ? null : getToken();
  if (deviceToken) {
    opts.headers['X-Device-Token'] = deviceToken;
  } else if (jwtToken) {
    opts.headers['Authorization'] = `Bearer ${jwtToken}`;
  }
  if (body) {
    if (isFormData) {
      opts.body = body;
    } else {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
  }
  const controller = new AbortController();
  const _timer = setTimeout(() => controller.abort(), 30000);
  let res;
  try {
    res = await fetch(BASE + path, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(_timer);
  }
  if (res.status === 401) {
    if (jwtToken) {
      localStorage.removeItem('ds_token');
      fireUnauthorized();
    }
    throw new Error('Unauthorized');
  }
  if (res.status === 403) {
    let msg = 'Недостаточно прав для выполнения этого действия';
    try { const j = await res.json(); msg = j.error || msg; } catch {}
    const err = new PermissionError(msg);
    window.dispatchEvent(new CustomEvent('ds:permission-denied', { detail: { message: msg } }));
    throw err;
  }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const api = {
  _req: req,
  // Auth
  login: (data) => req('POST', '/auth/login', data),
  getMe: () => req('GET', '/auth/me'),

  // Roles
  getRoles: () => req('GET', '/roles'),
  createRole: (data) => req('POST', '/roles', data),
  updateRole: (id, data) => req('PUT', `/roles/${id}`, data),
  deleteRole: (id) => req('DELETE', `/roles/${id}`),

  // Users
  getUsers: () => req('GET', '/users'),
  createUser: (data) => req('POST', '/users', data),
  updateUser: (id, data) => req('PUT', `/users/${id}`, data),
  deleteUser: (id) => req('DELETE', `/users/${id}`),
  bulkUsers: (data) => req('POST', '/users/bulk', data),
  exportUsers: (format) => `${BASE}/users/export?format=${format}`,
  importUsers: (data) => req('POST', '/users/import', data),

  // Content
  getContent: () => req('GET', '/content'),
  uploadFile: (fd) => req('POST', '/content/upload', fd, true),
  addWebpage: (data) => req('POST', '/content/webpage', data),
  addHtml: (data) => req('POST', '/content/html', data),
  updateContent: (id, data) => req('PUT', `/content/${id}`, data),
  deleteContent: (id) => req('DELETE', `/content/${id}`),

  // Playlists
  getPlaylists: () => req('GET', '/playlists'),
  createPlaylist: (data) => req('POST', '/playlists', data),
  getPlaylist: (id) => req('GET', `/playlists/${id}`),
  updatePlaylist: (id, data) => req('PUT', `/playlists/${id}`, data),
  deletePlaylist: (id) => req('DELETE', `/playlists/${id}`),
  addItem: (pid, data) => req('POST', `/playlists/${pid}/items`, data),
  updateItem: (pid, iid, data) => req('PUT', `/playlists/${pid}/items/${iid}`, data),
  reorderItems: (pid, items) => req('PUT', `/playlists/${pid}/items/reorder`, { items }),
  removeItem: (pid, iid) => req('DELETE', `/playlists/${pid}/items/${iid}`),

  // Scenes
  getScenes: () => req('GET', '/scenes'),
  createScene: (data) => req('POST', '/scenes', data),
  getScene: (id) => req('GET', `/scenes/${id}`),
  updateScene: (id, data) => req('PUT', `/scenes/${id}`, data),
  deleteScene: (id) => req('DELETE', `/scenes/${id}`),
  saveSceneObjects: (id, objects) => req('PUT', `/scenes/${id}/objects`, { objects }),

  // Screens
  getScreens: () => req('GET', '/screens'),
  createScreen: (data) => req('POST', '/screens', data),
  updateScreen: (id, data) => req('PUT', `/screens/${id}`, data),
  deleteScreen: (id) => req('DELETE', `/screens/${id}`),
  getScreenPlaylist: (id, deviceToken) => req('GET', `/screens/${id}/playlist`, null, false, deviceToken),
  pollScreenCommand: (id, deviceToken) => req('GET', `/screens/${id}/command`, null, false, deviceToken),
  sendCommand: (id, command) => req('POST', `/screens/${id}/command`, { command }),

  // Devices
  getDevices: () => req('GET', '/devices'),
  updateDevice: (id, data) => req('PUT', `/devices/${id}`, data),
  deleteDevice: (id) => req('DELETE', `/devices/${id}`),
  registerDevice: (data) => req('POST', '/devices/register', data),
  pollDeviceScreen: (id) => req('GET', `/devices/${id}/screen`),
  approveDevice: (id) => req('POST', `/devices/${id}/approve`),
  revokeDevice: (id) => req('POST', `/devices/${id}/revoke`),

  // TV remote commands
  sendTvCommand: (id, command) => req('POST', `/devices/${id}/tv-command`, { command }),

  // Groups
  getGroups: () => req('GET', '/groups'),
  createGroup: (data) => req('POST', '/groups', data),
  updateGroup: (id, data) => req('PUT', `/groups/${id}`, data),
  deleteGroup: (id) => req('DELETE', `/groups/${id}`),
  addGroupMember: (groupId, deviceId) => req('POST', `/groups/${groupId}/members`, { device_id: deviceId }),
  removeGroupMember: (groupId, deviceId) => req('DELETE', `/groups/${groupId}/members/${deviceId}`),
  sendGroupTvCommand: (groupId, command) => req('POST', `/groups/${groupId}/tv-command`, { command }),

  // Dashboard
  getDashboard: () => req('GET', '/dashboard'),

  // Duplicate
  duplicatePlaylist: (id) => req('POST', `/playlists/${id}/duplicate`),
  duplicateScene: (id) => req('POST', `/scenes/${id}/duplicate`),

  // Playlist versions
  getPlaylistVersions: (id) => req('GET', `/playlists/${id}/versions`),
  createPlaylistVersion: (id, data) => req('POST', `/playlists/${id}/versions`, data),
  restorePlaylistVersion: (id, vid) => req('POST', `/playlists/${id}/versions/${vid}/restore`),
  deletePlaylistVersion: (id, vid) => req('DELETE', `/playlists/${id}/versions/${vid}`),

  // Scene versions
  getSceneVersions: (id) => req('GET', `/scenes/${id}/versions`),
  createSceneVersion: (id, data) => req('POST', `/scenes/${id}/versions`, data),
  restoreSceneVersion: (id, vid) => req('POST', `/scenes/${id}/versions/${vid}/restore`),
  deleteSceneVersion: (id, vid) => req('DELETE', `/scenes/${id}/versions/${vid}`),

  // Webhooks
  getWebhooks: () => req('GET', '/webhooks'),
  createWebhook: (data) => req('POST', '/webhooks', data),
  updateWebhook: (id, data) => req('PUT', `/webhooks/${id}`, data),
  deleteWebhook: (id) => req('DELETE', `/webhooks/${id}`),
  testWebhook: (id) => req('POST', `/webhooks/${id}/test`),

  // Schedules
  getSchedules: () => req('GET', '/schedules'),
  getDeviceSchedule: (deviceId) => req('GET', `/schedules/device/${deviceId}`),
  createSchedule: (data) => req('POST', '/schedules', data),
  updateSchedule: (id, data) => req('PUT', `/schedules/${id}`, data),
  deleteSchedule: (id) => req('DELETE', `/schedules/${id}`),

  // Widgets proxy
  getWeatherWidget: (params) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
    return req('GET', `/widgets/weather${q ? '?' + q : ''}`);
  },
  getCurrencyWidget: () => req('GET', '/widgets/currency'),

  // Logs
  getLogs: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
    return req('GET', `/logs${q ? '?' + q : ''}`);
  },
  clearLogs: () => req('DELETE', '/logs'),
};

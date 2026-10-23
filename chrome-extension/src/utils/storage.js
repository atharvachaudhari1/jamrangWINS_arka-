// Chrome storage helpers — use chrome.storage.local for persistence across popup closes

export function get(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

export function set(items) {
  return new Promise((resolve) => chrome.storage.local.set(items, resolve));
}

export function remove(keys) {
  return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
}

export async function getToken() {
  const { authToken } = await get(['authToken']);
  return authToken || null;
}

export async function setToken(token) {
  await set({ authToken: token });
}

export async function clearAuth() {
  await remove(['authToken', 'user']);
}

export async function getUser() {
  const { user } = await get(['user']);
  return user || null;
}

export async function setUser(user) {
  await set({ user });
}

export async function getApiUrl() {
  const { apiUrl } = await get(['apiUrl']);
  return apiUrl || 'http://localhost:4000/api';
}

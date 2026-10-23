import { io } from 'socket.io-client';
import { getApiUrl, getToken } from './storage.js';

let socket = null;

export async function connectSocket() {
  if (socket?.connected) return socket;

  const [apiUrl, token] = await Promise.all([getApiUrl(), getToken()]);
  if (!token) return null;

  const baseUrl = apiUrl.replace('/api', '');

  socket = io(baseUrl, {
    auth: { token },
    transports: ['websocket'],
    autoConnect: true,
  });

  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

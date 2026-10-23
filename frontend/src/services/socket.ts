import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

export const getSocket = (): Socket => {
  if (!socket) {
    socket = io(import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001', {
      withCredentials: true,
      autoConnect: false,
    })
  }
  return socket
}

export const connectSocket = (token: string) => {
  const s = getSocket()
  s.auth = { token }
  s.connect()
  return s
}

export const disconnectSocket = () => {
  socket?.disconnect()
  socket = null
}

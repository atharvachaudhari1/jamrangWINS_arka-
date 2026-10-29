import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
  withCredentials: true,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res.data,
  async (err) => {
    if (err.response?.status === 401) {
      try {
        const { data } = await axios.post(
          `${import.meta.env.VITE_API_URL || 'http://localhost:4000/api'}/auth/refresh`,
          {},
          { withCredentials: true }
        )
        localStorage.setItem('accessToken', data.accessToken)
        err.config.headers.Authorization = `Bearer ${data.accessToken}`
        return api.request(err.config)
      } catch {
        localStorage.removeItem('accessToken')
        window.location.href = '/auth'
      }
    }
    return Promise.reject(err)
  }
)

export const getProfile = () => api.get('/profile')
export const updateProfile = (data: {
  name?: string
  gender?: string
  email?: string
  preferredTheme?: string
  availableStudyMins?: number
  rhythmEnabled?: boolean
  education?: {
    department?: string
    program?: string
    year?: string
    semester?: string
    dailyStudyMins?: number
    setupComplete?: boolean
  }
  publicProfile?: {
    name?: string
    github?: string
    linkedin?: string
    portfolio?: string
    email?: string
  }
}) => api.put('/profile', data)

export default api

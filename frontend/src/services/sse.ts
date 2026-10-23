export function createSSEStream(
  url: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: Error) => void
): () => void {
  const controller = new AbortController()
  const token = localStorage.getItem('accessToken')

  fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000/api'}${url}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: controller.signal,
  })
    .then(async (res) => {
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) { onDone(); break }
        const text = decoder.decode(value)
        const lines = text.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') { onDone(); return }
            try {
              const parsed = JSON.parse(data)
              onChunk(parsed.text || '')
            } catch {}
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') onError(err)
    })

  return () => controller.abort()
}

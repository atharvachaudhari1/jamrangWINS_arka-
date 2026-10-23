import { useState, useCallback } from 'react'
import { createSSEStream } from '../services/sse'

export function useAIStream() {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stream = useCallback((prompt: string) => {
    setText('')
    setLoading(true)
    setError(null)

    const cancel = createSSEStream(
      `/ai/chat?prompt=${encodeURIComponent(prompt)}`,
      (chunk) => setText((prev) => prev + chunk),
      () => setLoading(false),
      (err) => { setError(err.message); setLoading(false) }
    )

    return cancel
  }, [])

  return { text, loading, error, stream }
}

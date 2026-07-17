const DEFAULT_TIMEOUT = 5000

export async function fetchWithTimeout(input, init = {}) {
  const url = typeof input === 'string' ? input : input.url
  const controller = new AbortController()
  const timeout = init.timeout != null ? Number(init.timeout) : DEFAULT_TIMEOUT
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    })
    return response
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error(`Request to ${url} timed out after ${timeout}ms`)
      timeoutError.code = 'FETCH_TIMEOUT'
      throw timeoutError
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

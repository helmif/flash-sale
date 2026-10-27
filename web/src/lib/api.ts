/** Every failed call rejects with this: the server's RFC 9457 problem (`code`, `detail`), or NETWORK_ERROR. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

/** Fetches JSON and unwraps the server's `{ data }` envelope. */
export const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Network error, please try again.')
  }

  const body = await res.json().catch(() => null)
  if (!res.ok) {
    // application/problem+json: { type, title, status, detail, code }
    throw new ApiError(
      res.status,
      body?.code ?? 'UNKNOWN_ERROR',
      body?.detail ?? 'Something went wrong, please try again.',
    )
  }
  return body.data as T
}

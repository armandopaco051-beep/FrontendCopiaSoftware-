export const API_URL = 'http://127.0.0.1:8001'
export const AUTH_UNAUTHORIZED_EVENT = 'drawschema:auth-unauthorized'

export class ApiError extends Error {
  status: number
  detail: unknown

  constructor(message: string, status: number, detail: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

type RequestOptions<TBody> = {
  body?: TBody
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  token?: string
}

export async function apiRequest<TResponse, TBody = unknown>(
  path: string,
  options: RequestOptions<TBody> = {},
): Promise<TResponse> {
  const token = options.token ?? localStorage.getItem('token')
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') {
      localStorage.removeItem('token')
      window.dispatchEvent(new CustomEvent(AUTH_UNAUTHORIZED_EVENT))
    }

    throw new ApiError(
      data?.detail ?? data?.message ?? 'Error en la peticion. Revisa el backend.',
      response.status,
      data?.detail,
    )
  }

  return data as TResponse
}

export function postData<TResponse, TBody>(path: string, body: TBody) {
  return apiRequest<TResponse, TBody>(path, {
    method: 'POST',
    body,
  })
}

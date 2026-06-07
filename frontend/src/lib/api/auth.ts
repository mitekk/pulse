// ============================================================
// Auth API functions — all endpoints from api-contract.md §Auth
// ============================================================

import { apiClient } from './client'
import type {
  AuthResponse,
  LoginRequest,
  MeResponse,
  RefreshResponse,
  RegisterRequest,
  SessionDto,
  VerifyEmailRequest,
  VerifyEmailResponse,
  CursorPage,
} from '@/types/api'

export const authApi = {
  register: (body: RegisterRequest): Promise<AuthResponse> =>
    apiClient.post<AuthResponse>('/auth/register', body),

  login: (body: LoginRequest): Promise<AuthResponse> =>
    apiClient.post<AuthResponse>('/auth/login', body),

  refresh: (): Promise<RefreshResponse> =>
    apiClient.post<RefreshResponse>('/auth/refresh'),

  logout: (): Promise<void> => apiClient.post<void>('/auth/logout'),

  me: (): Promise<MeResponse> => apiClient.get<MeResponse>('/auth/me'),

  verifyEmail: (body: VerifyEmailRequest): Promise<VerifyEmailResponse> =>
    apiClient.post<VerifyEmailResponse>('/auth/verify-email', body),

  getSessions: (): Promise<CursorPage<SessionDto>> =>
    apiClient.get<CursorPage<SessionDto>>('/auth/sessions'),

  deleteSession: (id: string): Promise<void> =>
    apiClient.delete<void>(`/auth/sessions/${id}`),
}

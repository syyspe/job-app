import { createContext, useContext } from 'react'

export type ToastKind = 'success' | 'error'

export const TOAST_DURATIONS_MS: Record<ToastKind, number> = {
  success: 4000,
  error: 8000,
}

export const MAX_TOASTS = 3

export interface Toast {
  id: number
  kind: ToastKind
  message: string
}

export interface ToastApi {
  showSuccess: (message: string) => void
  showError: (message: string) => void
}

export const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) {
    throw new Error('useToast must be used inside a ToastProvider')
  }
  return api
}

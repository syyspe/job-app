import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ToastHost } from './ToastHost.tsx'
import { MAX_TOASTS, TOAST_DURATIONS_MS, ToastContext } from '../lib/toast.ts'
import type { Toast, ToastKind } from '../lib/toast.ts'

let nextId = 0

interface ToastProviderProps {
  children: ReactNode
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback(
    (kind: ToastKind, message: string) => {
      nextId += 1
      const id = nextId
      setToasts((current) =>
        [...current, { id, kind, message }].slice(-MAX_TOASTS),
      )
      setTimeout(() => dismiss(id), TOAST_DURATIONS_MS[kind])
    },
    [dismiss],
  )

  const api = useMemo(
    () => ({
      showSuccess: (message: string) => show('success', message),
      showError: (message: string) => show('error', message),
    }),
    [show],
  )

  return (
    <ToastContext value={api}>
      {children}
      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </ToastContext>
  )
}

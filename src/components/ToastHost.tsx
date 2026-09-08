import type { Toast } from '../lib/toast.ts'

const GLYPHS = { success: '✓', error: '!' }
const PREFIXES = { success: 'Success:', error: 'Error:' }

interface ToastHostProps {
  toasts: Toast[]
  onDismiss: (id: number) => void
}

export function ToastHost({ toasts, onDismiss }: ToastHostProps) {
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.kind}`}
          role={toast.kind === 'error' ? 'alert' : undefined}
          aria-live={toast.kind === 'error' ? undefined : 'polite'}
        >
          <span aria-hidden="true">{GLYPHS[toast.kind]}</span>
          <span className="visually-hidden">{PREFIXES[toast.kind]}</span>
          <span>{toast.message}</span>
          <button
            type="button"
            className="toast-dismiss"
            aria-label={`Dismiss: ${toast.message}`}
            onClick={() => onDismiss(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

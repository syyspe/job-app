import { useCallback } from 'react'
import { UnauthorizedError } from './api.ts'
import { useToast } from './toast.ts'

export function useApiAction(onUnauthorized: () => void) {
  const { showSuccess, showError } = useToast()

  return useCallback(
    async (task: () => Promise<void>, successMessage?: string) => {
      try {
        await task()
        if (successMessage) showSuccess(successMessage)
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          showError('Your session expired — please log in again')
          onUnauthorized()
          return
        }
        showError(error instanceof Error ? error.message : 'Something went wrong')
      }
    },
    [onUnauthorized, showSuccess, showError],
  )
}

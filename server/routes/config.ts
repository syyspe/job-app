import { Router } from 'express'

export function createConfigRouter(pageSize: number): Router {
  const router = Router()
  router.get('/config', (_req, res) => {
    res.json({ pageSize })
  })
  return router
}

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const KEY_LENGTH = 64

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const key = scryptSync(password, salt, KEY_LENGTH)
  return `${salt.toString('hex')}:${key.toString('hex')}`
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [saltHex, keyHex] = storedHash.split(':')
  const salt = Buffer.from(saltHex, 'hex')
  const key = Buffer.from(keyHex, 'hex')
  const candidate = scryptSync(password, salt, KEY_LENGTH)
  return timingSafeEqual(candidate, key)
}

export function createSessionToken(): string {
  return randomBytes(32).toString('hex')
}

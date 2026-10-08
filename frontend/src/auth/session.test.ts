import { describe, expect, it, vi } from 'vitest'
import { clearToken, getToken, setToken } from './session'

describe('session token', () => {
  it('is stored for the tab and can be cleared', () => {
    expect(getToken()).toBeNull()
    setToken('abc')
    expect(getToken()).toBe('abc')
    expect(sessionStorage.getItem('tr.token')).toBe('abc')
    clearToken()
    expect(getToken()).toBeNull()
  })

  it('reports no token when storage is blocked instead of throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(getToken()).toBeNull()
  })
})

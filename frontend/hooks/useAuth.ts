'use client'

// Auth is disabled — no login required.
// This stub exists to satisfy any remaining import references.

export function useAuth() {
  return {
    user: null,
    loading: false,
    login: async () => false,
    logout: () => {},
    isAuthenticated: true,
  }
}

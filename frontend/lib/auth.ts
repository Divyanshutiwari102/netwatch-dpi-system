// Auth is disabled — stubs to prevent import errors

export const tokenStore = {
  get: () => 'no-auth',
  set: () => {},
  clear: () => {},
}

export async function login(_email: string, _password: string) {
  return null
}

export async function verifyToken(_token: string) {
  return null
}

export function validateCredentials(_email: string, _password: string) {
  return null
}

export async function signToken(_user: any) {
  return 'no-auth-token'
}

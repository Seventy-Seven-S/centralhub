export interface TokenPayload {
  userId: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'AGENT' | 'CLIENT';
  iat: number;
  exp: number;
}

export function decodeToken(token: string): TokenPayload | null {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload)) as TokenPayload;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = decodeToken(token);
  if (!payload) return true;
  return Date.now() / 1000 > payload.exp;
}

export function isAdminOrStaff(role: string): boolean {
  return ['ADMIN', 'MANAGER', 'AGENT'].includes(role);
}

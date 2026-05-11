import { jwtVerify, SignJWT } from 'jose';
import { cookies } from 'next/headers';

const isBuildPhase =
  process.env.PHASE === 'phase-production-build' ||
  process.env.NEXT_PHASE === 'phase-production-build' ||
  process.env.SKIP_ENV_VALIDATION === 'true';

const secretKey = process.env.JWT_SECRET;
if (!secretKey || secretKey === 'fallback_secret_for_development') {
  if (process.env.NODE_ENV === 'production' && !isBuildPhase) {
    throw new Error('FATAL: JWT_SECRET environment variable is not defined or is set to fallback value in production.');
  }
}
const safeSecret = secretKey || 'fallback_secret_for_development';
const key = new TextEncoder().encode(safeSecret);

export async function signToken(payload: any) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key);
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
    });
    return payload;
  } catch (error) {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('admin_session')?.value;
  if (!sessionToken) return null;
  return await verifyToken(sessionToken);
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete('admin_session');
}

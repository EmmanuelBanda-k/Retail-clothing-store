import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'urban_pos_session';
const encoder = new TextEncoder();

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const separator = part.indexOf('=');
    return [part.slice(0, separator), part.slice(separator + 1)];
  }));
}

export function createSessionManager(secret, { secure = false, lifetimeSeconds = 8 * 60 * 60 } = {}) {
  if (!secret || encoder.encode(secret).length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters');
  }

  const sign = payload => createHmac('sha256', secret).update(payload).digest('base64url');
  const attributes = `HttpOnly; SameSite=Strict; Path=/; Max-Age=${lifetimeSeconds}${secure ? '; Secure' : ''}`;

  return {
    create(user) {
      const payload = encode({
        userId: user.id,
        storeId: user.store_id,
        role: user.role,
        name: user.name,
        exp: Math.floor(Date.now() / 1000) + lifetimeSeconds
      });
      return `${COOKIE_NAME}=${payload}.${sign(payload)}; ${attributes}`;
    },

    clear() {
      return `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure ? '; Secure' : ''}`;
    },

    read(request) {
      const token = parseCookies(request.headers.cookie)[COOKIE_NAME];
      if (!token) return null;
      const [payload, signature] = token.split('.');
      if (!payload || !signature) return null;
      const expected = sign(payload);
      const suppliedBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expected);
      if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) return null;
      try {
        const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        return session.exp > Math.floor(Date.now() / 1000) ? session : null;
      } catch {
        return null;
      }
    }
  };
}

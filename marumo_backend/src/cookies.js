function decodeValue(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseCookieHeader(header) {
  const jar = {};
  if (typeof header !== 'string' || header.length === 0) return jar;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (!name || name in jar) continue;
    jar[name] = decodeValue(part.slice(index + 1).trim());
  }
  return jar;
}

function attributes({ maxAgeSeconds, secure, sameSite }) {
  return `Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=${sameSite}${secure ? '; Secure' : ''}`;
}

export function sessionCookie({ name, value, maxAgeSeconds, secure, sameSite }) {
  return `${name}=${value}; ${attributes({ maxAgeSeconds, secure, sameSite })}`;
}

export function csrfCookie({ name, value, maxAgeSeconds, secure, sameSite }) {
  return `${name}=${value}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=${sameSite}${secure ? '; Secure' : ''}`;
}

export function clearedCookie({ name, secure, sameSite }) {
  return `${name}=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=${sameSite}${secure ? '; Secure' : ''}`;
}

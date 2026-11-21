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

function attributes({ maxAgeSeconds, httpOnly, secure, sameSite }) {
  return `Max-Age=${maxAgeSeconds}; Path=/${httpOnly ? '; HttpOnly' : ''}; SameSite=${sameSite}${secure ? '; Secure' : ''}`;
}

export function sessionCookie({ name, value, ...options }) {
  return `${name}=${value}; ${attributes(options)}`;
}

export function csrfCookie({ name, value, ...options }) {
  return `${name}=${value}; ${attributes({ ...options, httpOnly: false })}`;
}

export function clearedCookie({ name, ...options }) {
  return `${name}=; ${attributes({ ...options, maxAgeSeconds: 0 })}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8' };

function send(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, { ...jsonHeaders, ...headers });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 1_000_000) throw Object.assign(new Error('Request body is too large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('Request body must contain valid JSON'), { statusCode: 400 });
  }
}

function requireRole(session, roles) {
  if (!session) throw Object.assign(new Error('Sign in to continue'), { statusCode: 401 });
  if (!roles.includes(session.role)) throw Object.assign(new Error('Your role cannot perform this action'), { statusCode: 403 });
}

function verifySameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return;
  const protocol = request.headers['x-forwarded-proto'] || 'http';
  if (origin !== `${protocol}://${request.headers.host}`) {
    throw Object.assign(new Error('Cross-origin request rejected'), { statusCode: 403 });
  }
}

export function createApiHandler(service, sessions) {
  return async function handleApi(request, response, url) {
    try {
      if (request.method === 'GET' && url.pathname === '/api/health') {
        return send(response, 200, await service.health());
      }
      if (request.method === 'POST' && url.pathname === '/api/login') {
        const body = await readJson(request);
        const user = await service.login(body.username || '', body.pin || '');
        return user
          ? send(response, 200, { user }, { 'Set-Cookie': sessions.create(user) })
          : send(response, 401, { error: 'Wrong username or PIN' });
      }
      if (request.method === 'POST' && url.pathname === '/api/logout') {
        verifySameOrigin(request);
        return send(response, 200, { ok: true }, { 'Set-Cookie': sessions.clear() });
      }
      const session = sessions.read(request);
      if (request.method === 'GET' && url.pathname === '/api/session') {
        requireRole(session, ['owner', 'cashier', 'inventory']);
        return send(response, 200, { user: {
          id: session.userId,
          store_id: session.storeId,
          name: session.name,
          first: session.name.split(' ')[0],
          role: session.role
        } });
      }
      if (request.method === 'GET' && url.pathname === '/api/snapshot') {
        requireRole(session, ['owner', 'cashier', 'inventory']);
        return send(response, 200, await service.snapshot(session));
      }
      if (request.method === 'POST' && url.pathname === '/api/sales') {
        verifySameOrigin(request);
        requireRole(session, ['owner', 'cashier']);
        return send(response, 201, await service.completeSale(session, await readJson(request)));
      }
      if (request.method === 'POST' && /^\/api\/sales\/\d+\/refund$/.test(url.pathname)) {
        verifySameOrigin(request);
        requireRole(session, ['owner']);
        const saleId = Number(url.pathname.split('/')[3]);
        return send(response, 200, await service.refundSale(session, { saleId, ...await readJson(request) }));
      }
      if (request.method === 'POST' && url.pathname === '/api/inventory/receive') {
        verifySameOrigin(request);
        requireRole(session, ['owner', 'inventory']);
        return send(response, 200, await service.receiveStock(session, await readJson(request)));
      }
      if (request.method === 'POST' && url.pathname === '/api/products') {
        verifySameOrigin(request);
        requireRole(session, ['owner', 'inventory']);
        return send(response, 201, await service.addProduct(session, await readJson(request)));
      }
      return send(response, 404, { error: 'API endpoint not found' });
    } catch (error) {
      console.error(error);
      return send(response, error.statusCode || 500, {
        error: error.statusCode ? error.message : 'The database operation could not be completed'
      });
    }
  };
}

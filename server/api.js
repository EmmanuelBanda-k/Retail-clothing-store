const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8' };

function send(response, statusCode, body) {
  response.writeHead(statusCode, jsonHeaders);
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

export function createApiHandler(service) {
  return async function handleApi(request, response, url) {
    try {
      if (request.method === 'GET' && url.pathname === '/api/health') {
        return send(response, 200, await service.health());
      }
      if (request.method === 'POST' && url.pathname === '/api/login') {
        const body = await readJson(request);
        const user = await service.login(body.username || '', body.pin || '');
        return user ? send(response, 200, { user }) : send(response, 401, { error: 'Wrong username or PIN' });
      }
      if (request.method === 'GET' && url.pathname === '/api/snapshot') {
        return send(response, 200, await service.snapshot(url.searchParams.get('storeId')));
      }
      if (request.method === 'POST' && url.pathname === '/api/sales') {
        return send(response, 201, await service.completeSale(await readJson(request)));
      }
      if (request.method === 'POST' && /^\/api\/sales\/\d+\/refund$/.test(url.pathname)) {
        const saleId = Number(url.pathname.split('/')[3]);
        return send(response, 200, await service.refundSale({ saleId, ...await readJson(request) }));
      }
      if (request.method === 'POST' && url.pathname === '/api/inventory/receive') {
        return send(response, 200, await service.receiveStock(await readJson(request)));
      }
      if (request.method === 'POST' && url.pathname === '/api/products') {
        return send(response, 201, await service.addProduct(await readJson(request)));
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

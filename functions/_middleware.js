const CANONICAL_HOST = 'licollectorsco.com';
const BLOG_ROUTE_PATTERN = /^\/blog(?:\/[^/]+)?$/;
const NOT_FOUND_PATH = '/404.html';
const HTML_ACCEPT = /text\/html/i;

const isNavigationRequest = (request) => request.method === 'GET'
  && HTML_ACCEPT.test(request.headers.get('accept') || '');

const notFoundResponse = async (context, url) => {
  const assetResponse = await context.env.ASSETS.fetch(new URL(NOT_FOUND_PATH, url));
  if (assetResponse.status === 404) {
    return new Response('Not Found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  return new Response(assetResponse.body, {
    status: 404,
    headers: assetResponse.headers,
  });
};

export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (url.hostname === `www.${CANONICAL_HOST}`) {
    url.hostname = CANONICAL_HOST;
    return Response.redirect(url.toString(), 301);
  }

  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
    return Response.redirect(url.toString(), 301);
  }

  if (!isNavigationRequest(context.request)) return context.next();
  if (url.pathname === '/') return context.next();

  if (BLOG_ROUTE_PATTERN.test(url.pathname)) {
    const assetUrl = new URL(url);
    assetUrl.pathname = `${url.pathname}/index.html`;

    const assetResponse = await context.env.ASSETS.fetch(assetUrl);
    if (assetResponse.status !== 404) {
      return assetResponse;
    }
  }

  return notFoundResponse(context, url);
}

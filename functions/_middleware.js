const CANONICAL_HOST = 'licollectorsco.com';
const BLOG_ROUTE_PATTERN = /^\/blog(?:\/[^/]+)?$/;

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

  if (BLOG_ROUTE_PATTERN.test(url.pathname)) {
    const assetUrl = new URL(url);
    assetUrl.pathname = `${url.pathname}/index.html`;

    const assetResponse = await context.env.ASSETS.fetch(assetUrl);
    if (assetResponse.status !== 404) {
      return assetResponse;
    }
  }

  return context.next();
}

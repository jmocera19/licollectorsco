import { useLayoutEffect } from 'react';

const SITE_URL = 'https://licollectorsco.com';
const DEFAULT_IMAGE = `${SITE_URL}/og_preview.jpg`;

type StructuredData = Record<string, unknown>;

interface SeoProps {
  title: string;
  description: string;
  path: string;
  type?: 'website' | 'article';
  publishedTime?: string;
  noIndex?: boolean;
  structuredData?: StructuredData;
}

const ensureMeta = (key: string, attribute: 'name' | 'property', value: string) => {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[data-seo="${key}"]`);

  if (!element) {
    element = document.createElement('meta');
    element.dataset.seo = key;
    document.head.appendChild(element);
  }

  element.removeAttribute(attribute === 'name' ? 'property' : 'name');
  element.setAttribute(attribute, value);
  return element;
};

const setMeta = (
  key: string,
  attribute: 'name' | 'property',
  value: string,
  content?: string,
) => {
  const existing = document.head.querySelector<HTMLMetaElement>(`meta[data-seo="${key}"]`);

  if (!content) {
    existing?.remove();
    return;
  }

  ensureMeta(key, attribute, value).content = content;
};

const normalizePath = (path: string) => {
  if (!path || path === '/') return '/';
  return path.startsWith('/') ? path : `/${path}`;
};

const Seo = ({
  title,
  description,
  path,
  type = 'website',
  publishedTime,
  noIndex = false,
  structuredData,
}: SeoProps) => {
  const canonicalUrl = `${SITE_URL}${normalizePath(path)}`;

  useLayoutEffect(() => {
    document.title = title;

    setMeta('description', 'name', 'description', description);
    setMeta('robots', 'name', 'robots', noIndex ? 'noindex, follow' : 'index, follow');
    setMeta('og-type', 'property', 'og:type', type);
    setMeta('og-url', 'property', 'og:url', canonicalUrl);
    setMeta('og-title', 'property', 'og:title', title);
    setMeta('og-description', 'property', 'og:description', description);
    setMeta('og-image', 'property', 'og:image', DEFAULT_IMAGE);
    setMeta('og-image-type', 'property', 'og:image:type', 'image/jpeg');
    setMeta('og-image-width', 'property', 'og:image:width', '1024');
    setMeta('og-image-height', 'property', 'og:image:height', '541');
    setMeta('og-site-name', 'property', 'og:site_name', 'Long Island Collectors Co.');
    setMeta('twitter-card', 'name', 'twitter:card', 'summary_large_image');
    setMeta('twitter-title', 'name', 'twitter:title', title);
    setMeta('twitter-description', 'name', 'twitter:description', description);
    setMeta('twitter-image', 'name', 'twitter:image', DEFAULT_IMAGE);
    setMeta('article-published-time', 'property', 'article:published_time', publishedTime);

    let canonical = document.head.querySelector<HTMLLinkElement>('link[data-seo="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.dataset.seo = 'canonical';
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    let jsonLd = document.head.querySelector<HTMLScriptElement>('script[data-seo="structured-data"]');
    if (structuredData) {
      if (!jsonLd) {
        jsonLd = document.createElement('script');
        jsonLd.dataset.seo = 'structured-data';
        jsonLd.type = 'application/ld+json';
        document.head.appendChild(jsonLd);
      }
      jsonLd.textContent = JSON.stringify(structuredData);
    } else {
      jsonLd?.remove();
    }
  }, [canonicalUrl, description, noIndex, publishedTime, structuredData, title, type]);

  return null;
};

export default Seo;

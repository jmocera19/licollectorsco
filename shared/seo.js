// Canonical metadata for every route. Imported by the browser (`Seo.tsx`) and
// by the build scripts (`prerender-pages.js`, `generate-sitemap.js`) so both
// surfaces render the same titles, canonical URLs, social tags, and JSON-LD.

export const SITE_URL = 'https://licollectorsco.com';
export const SITE_NAME = 'Long Island Collectors Co.';
const CONTACT_EMAIL = 'info@licollectorsco.com';
export const DEFAULT_IMAGE = `${SITE_URL}/og_preview.jpg`;
export const DEFAULT_IMAGE_TYPE = 'image/jpeg';
export const DEFAULT_IMAGE_WIDTH = '1024';
export const DEFAULT_IMAGE_HEIGHT = '541';

export const BLOG_TITLE = 'Pokémon Card Grading & Market Guides | Long Island Collectors Co.';
export const BLOG_DESCRIPTION = 'Read Pokémon card grading guides, collector strategies, market analysis, and hobby news from Long Island Collectors Co.';
const BLOG_NAME = "The Collector's Blog";

export const HOME_TITLE = 'Long Island Collectors Co. | We Buy & Sell Pokémon & Funko';
export const HOME_DESCRIPTION = 'Buy or sell graded Pokémon cards, Funko Pops, and collectible collections with a trusted Long Island specialist. Request a fast, fair quote.';
const HOME_STRUCTURED_DESCRIPTION = 'Buy and sell graded Pokémon cards, Funko Pops, and collectible collections with a Long Island specialist.';

/**
 * @typedef {'website' | 'article'} SeoType
 * @typedef {object} SeoData
 * @property {string} title
 * @property {string} description
 * @property {string} path
 * @property {string} [canonicalUrl]
 * @property {SeoType} type
 * @property {string} [publishedTime]
 * @property {boolean} [noIndex]
 * @property {Record<string, unknown>} [structuredData]
 */

const organizationRef = () => ({
  '@type': 'Organization',
  name: SITE_NAME,
  url: `${SITE_URL}/`,
});

const homeStructuredData = () => ({
  '@context': 'https://schema.org',
  '@type': 'Store',
  name: SITE_NAME,
  description: HOME_STRUCTURED_DESCRIPTION,
  url: `${SITE_URL}/`,
  image: DEFAULT_IMAGE,
  email: CONTACT_EMAIL,
  priceRange: '$$',
  areaServed: {
    '@type': 'Place',
    name: 'Long Island, New York',
  },
  sameAs: [
    'https://www.ebay.com/usr/longislandcollectorsco',
    'https://www.instagram.com/licollectorsco',
    'https://www.tiktok.com/@licollectorsco',
    'https://www.youtube.com/@LongIslandCollectorsCo',
  ],
});

/** @returns {SeoData} */
export const homeSeo = () => ({
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  path: '/',
  canonicalUrl: `${SITE_URL}/`,
  type: 'website',
  structuredData: homeStructuredData(),
});

/**
 * @param {Array<{ slug: string, title: string, date: string }>} posts
 * @returns {SeoData}
 */
export const blogSeo = (posts) => {
  const ordered = [...posts].sort((left, right) => right.date.localeCompare(left.date));

  return {
    title: BLOG_TITLE,
    description: BLOG_DESCRIPTION,
    path: '/blog',
    canonicalUrl: `${SITE_URL}/blog`,
    type: 'website',
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: BLOG_NAME,
      description: BLOG_DESCRIPTION,
      url: `${SITE_URL}/blog`,
      publisher: organizationRef(),
      blogPost: ordered.map((post) => ({
        '@type': 'BlogPosting',
        headline: post.title,
        url: `${SITE_URL}/blog/${post.slug}`,
        datePublished: post.date,
      })),
    },
  };
};

/**
 * @param {{ slug: string, title: string, date: string, excerpt: string }} post
 * @returns {SeoData}
 */
export const articleSeo = (post) => {
  const path = `/blog/${post.slug}`;

  return {
    title: `${post.title} | LI Collectors Co.`,
    description: post.excerpt,
    path,
    canonicalUrl: `${SITE_URL}${path}`,
    type: 'article',
    publishedTime: post.date,
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.excerpt,
      datePublished: post.date,
      dateModified: post.date,
      mainEntityOfPage: `${SITE_URL}${path}`,
      image: DEFAULT_IMAGE,
      author: organizationRef(),
      publisher: {
        ...organizationRef(),
        logo: {
          '@type': 'ImageObject',
          url: DEFAULT_IMAGE,
        },
      },
    },
  };
};

/** @param {string} [path] */
export const notFoundSeo = (path = '/') => ({
  title: 'Page Not Found | Long Island Collectors Co.',
  description: 'The page you are looking for does not exist or may have been removed.',
  path,
  type: 'website',
  noIndex: true,
});

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const serializeJsonLd = (value) => JSON.stringify(value).replaceAll('<', '\\u003c');

export const SEO_BLOCK_PATTERN = /<!-- SEO:START -->[\s\S]*?<!-- SEO:END -->/;

/** @param {SeoData} seo */
export const renderSeoBlock = (seo) => `<!-- SEO:START -->
    <title data-seo="title">${escapeHtml(seo.title)}</title>
    <meta data-seo="description" name="description" content="${escapeHtml(seo.description)}" />
    <meta data-seo="robots" name="robots" content="${seo.noIndex ? 'noindex, follow' : 'index, follow'}" />${seo.canonicalUrl ? `
    <link data-seo="canonical" rel="canonical" href="${escapeHtml(seo.canonicalUrl)}" />` : ''}
    <meta data-seo="og-type" property="og:type" content="${seo.type}" />${seo.canonicalUrl ? `
    <meta data-seo="og-url" property="og:url" content="${escapeHtml(seo.canonicalUrl)}" />` : ''}
    <meta data-seo="og-title" property="og:title" content="${escapeHtml(seo.title)}" />
    <meta data-seo="og-description" property="og:description" content="${escapeHtml(seo.description)}" />
    <meta data-seo="og-image" property="og:image" content="${DEFAULT_IMAGE}" />
    <meta data-seo="og-image-type" property="og:image:type" content="${DEFAULT_IMAGE_TYPE}" />
    <meta data-seo="og-image-width" property="og:image:width" content="${DEFAULT_IMAGE_WIDTH}" />
    <meta data-seo="og-image-height" property="og:image:height" content="${DEFAULT_IMAGE_HEIGHT}" />
    <meta data-seo="og-site-name" property="og:site_name" content="${SITE_NAME}" />
    <meta data-seo="twitter-card" name="twitter:card" content="summary_large_image" />
    <meta data-seo="twitter-title" name="twitter:title" content="${escapeHtml(seo.title)}" />
    <meta data-seo="twitter-description" name="twitter:description" content="${escapeHtml(seo.description)}" />
    <meta data-seo="twitter-image" name="twitter:image" content="${DEFAULT_IMAGE}" />${seo.publishedTime ? `
    <meta data-seo="article-published-time" property="article:published_time" content="${escapeHtml(seo.publishedTime)}" />` : ''}${seo.structuredData ? `
    <script data-seo="structured-data" type="application/ld+json">${serializeJsonLd(seo.structuredData)}</script>` : ''}
    <!-- SEO:END -->`;

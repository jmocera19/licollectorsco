import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distPath = path.join(projectRoot, 'dist');
const templatePath = path.join(distPath, 'index.html');
const postsPath = path.join(projectRoot, 'src', 'posts.json');
const siteUrl = 'https://licollectorsco.com';
const defaultImage = `${siteUrl}/og_preview.jpg`;

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const serializeJsonLd = (value) => JSON.stringify(value).replaceAll('<', '\\u003c');

const renderSeoBlock = ({
  title,
  description,
  canonicalUrl,
  type = 'website',
  publishedTime,
  structuredData,
}) => `<!-- SEO:START -->
    <title data-seo="title">${escapeHtml(title)}</title>
    <meta data-seo="description" name="description" content="${escapeHtml(description)}" />
    <meta data-seo="robots" name="robots" content="index, follow" />
    <link data-seo="canonical" rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    <meta data-seo="og-type" property="og:type" content="${type}" />
    <meta data-seo="og-url" property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta data-seo="og-title" property="og:title" content="${escapeHtml(title)}" />
    <meta data-seo="og-description" property="og:description" content="${escapeHtml(description)}" />
    <meta data-seo="og-image" property="og:image" content="${defaultImage}" />
    <meta data-seo="og-image-type" property="og:image:type" content="image/jpeg" />
    <meta data-seo="og-image-width" property="og:image:width" content="1024" />
    <meta data-seo="og-image-height" property="og:image:height" content="541" />
    <meta data-seo="og-site-name" property="og:site_name" content="Long Island Collectors Co." />
    <meta data-seo="twitter-card" name="twitter:card" content="summary_large_image" />
    <meta data-seo="twitter-title" name="twitter:title" content="${escapeHtml(title)}" />
    <meta data-seo="twitter-description" name="twitter:description" content="${escapeHtml(description)}" />
    <meta data-seo="twitter-image" name="twitter:image" content="${defaultImage}" />${publishedTime ? `
    <meta data-seo="article-published-time" property="article:published_time" content="${escapeHtml(publishedTime)}" />` : ''}
    <script data-seo="structured-data" type="application/ld+json">${serializeJsonLd(structuredData)}</script>
    <!-- SEO:END -->`;

const template = fs.readFileSync(templatePath, 'utf8');
const posts = JSON.parse(fs.readFileSync(postsPath, 'utf8')).posts || [];
const seoBlockPattern = /<!-- SEO:START -->[\s\S]*?<!-- SEO:END -->/;

if (!seoBlockPattern.test(template)) {
  throw new Error('Could not find the SEO block in dist/index.html.');
}

const writeRoute = (routePath, seo) => {
  const targetDirectory = path.join(distPath, routePath);
  fs.mkdirSync(targetDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(targetDirectory, 'index.html'),
    template.replace(seoBlockPattern, renderSeoBlock(seo)),
    'utf8',
  );
};

const blogDescription = 'Read Pokémon card grading guides, collector strategies, market analysis, and hobby news from Long Island Collectors Co.';
const blogStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'Blog',
  name: "The Collector's Blog",
  description: blogDescription,
  url: `${siteUrl}/blog`,
  publisher: {
    '@type': 'Organization',
    name: 'Long Island Collectors Co.',
    url: `${siteUrl}/`,
  },
  blogPost: posts.map(post => ({
    '@type': 'BlogPosting',
    headline: post.title,
    url: `${siteUrl}/blog/${post.slug}`,
    datePublished: post.date,
  })),
};

writeRoute('blog', {
  title: 'Pokémon Card Grading & Market Guides | Long Island Collectors Co.',
  description: blogDescription,
  canonicalUrl: `${siteUrl}/blog`,
  structuredData: blogStructuredData,
});

for (const post of posts) {
  const canonicalUrl = `${siteUrl}/blog/${post.slug}`;
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    datePublished: post.date,
    dateModified: post.date,
    mainEntityOfPage: canonicalUrl,
    image: defaultImage,
    author: {
      '@type': 'Organization',
      name: 'Long Island Collectors Co.',
      url: `${siteUrl}/`,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Long Island Collectors Co.',
      url: `${siteUrl}/`,
      logo: {
        '@type': 'ImageObject',
        url: defaultImage,
      },
    },
  };

  writeRoute(path.join('blog', post.slug), {
    title: `${post.title} | LI Collectors Co.`,
    description: post.excerpt,
    canonicalUrl,
    type: 'article',
    publishedTime: post.date,
    structuredData,
  });
}

console.log(`✅ Pre-rendered metadata for ${posts.length + 1} routes.`);

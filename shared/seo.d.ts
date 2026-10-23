export type SeoType = 'website' | 'article';

export interface SeoData {
  title: string;
  description: string;
  path: string;
  canonicalUrl?: string;
  type: SeoType;
  publishedTime?: string;
  noIndex?: boolean;
  structuredData?: Record<string, unknown>;
}

export interface SeoPost {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
}

export const SITE_URL: string;
export const SITE_NAME: string;
export const DEFAULT_IMAGE: string;
export const DEFAULT_IMAGE_TYPE: string;
export const DEFAULT_IMAGE_WIDTH: string;
export const DEFAULT_IMAGE_HEIGHT: string;
export const BLOG_TITLE: string;
export const BLOG_DESCRIPTION: string;
export const HOME_TITLE: string;
export const HOME_DESCRIPTION: string;
export const SEO_BLOCK_PATTERN: RegExp;

export function homeSeo(): SeoData;
export function blogSeo(posts: ReadonlyArray<SeoPost>): SeoData;
export function articleSeo(post: SeoPost): SeoData;
export function notFoundSeo(path?: string): SeoData;
export function renderSeoBlock(seo: SeoData): string;

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, normalizePath } from 'vite';
import { readPostsFile } from '../shared/content.cjs';
import { prerenderSite } from '../scripts/prerender-site.mjs';
import { verifyArticleDocument } from '../scripts/article-output.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('production prerendering verifies fixture articles end to end', { timeout: 120000 }, async (t) => {
  const temporaryRoot = process.platform === 'win32' ? path.join(os.tmpdir(), 'opencode') : os.tmpdir();
  fs.mkdirSync(temporaryRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'lico-article-fixtures-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'package.json'), '{"type":"module"}');

  const fixturePath = path.join(directory, 'posts.json');
  const fixtures = [
    ['image-fixture', 'Image fixture', '![Card & holder](https://example.invalid/card.jpg "Card photo")'],
    ['hard-break', 'Hard break', 'First line.  \nSecond line.'],
    ['literal-html', 'Literal <em> tags & quotes', 'Text <em>literal tag</em> after.'],
    ['links', 'Links', '[Grading & prices](https://example.invalid/guide?a=1&b=2 "Quoted & linked")'],
    ['code', 'Code', '```js\nconst html = "<em>literal</em>";\n\n  // Keep indentation.\n```'],
    ['dollars', 'Literal $$ $& $` $\' $1', 'Keep $$, $&, $`, $\', and $1 literally.'],
    ['short', 'Brief', 'Short.'],
    ['h1-only', 'Heading only', '# Only a heading'],
    ['shared-opening', 'Shared opening', 'Shared opening.\n\nExpected final paragraph.'],
    ['different-article', 'Shared opening', 'Shared opening.\n\nUnrelated final paragraph.'],
  ];
  fs.writeFileSync(fixturePath, JSON.stringify({ posts: fixtures.map(([slug, title, body]) => ({
    id: slug,
    slug,
    title,
    date: '2026-10-23',
    tags: [],
    excerpt: `Fixture excerpt for ${slug}.`,
    body,
  })) }));
  const posts = readPostsFile(fixturePath);
  // Replace the JSON input at Vite's file-loading boundary, for both client
  // and server builds. Never edit source content or rewrite compiled bundles.
  const fixturePlugin = {
    name: 'fixture-posts',
    enforce: 'pre',
    load(id) {
      if (normalizePath(id.split('?')[0]) === normalizePath(path.join(projectRoot, 'src', 'posts.json'))) {
        return fs.readFileSync(fixturePath, 'utf8');
      }
    },
  };
  const distPath = path.join(directory, 'dist');
  const ssrPath = path.join(directory, 'ssr');
  const config = { root: projectRoot, logLevel: 'error', plugins: [fixturePlugin] };
  await build({ ...config, build: { outDir: distPath, emptyOutDir: true } });
  await build({
    ...config,
    ssr: { noExternal: true },
    build: { ssr: 'src/entry-server.tsx', outDir: ssrPath, emptyOutDir: true },
  });
  const { render } = await import(pathToFileURL(path.join(ssrPath, 'entry-server.js')).href);
  prerenderSite({ distPath, posts, render });

  const htmlFor = (slug) => fs.readFileSync(path.join(distPath, 'blog', slug, 'index.html'), 'utf8');
  for (const post of posts) {
    await t.test(post.slug, () => {
      assert.deepEqual(verifyArticleDocument(htmlFor(post.slug), post), []);
    });
  }

  await t.test('heading text cannot be supplied by hidden descendants', () => {
    const post = posts.find(({ slug }) => slug === 'short');
    const html = htmlFor(post.slug);
    const changed = html.replace(/(<h1 data-article="title"[^>]*>)[\s\S]*?(<\/h1>)/, '$1<span hidden>Brief</span>$2');
    assert.notEqual(changed, html, 'mutation must change the document');
    assert.notDeepEqual(verifyArticleDocument(changed, post), []);
  });

  await t.test('rejects incorrect head metadata even when the article matches', () => {
    const post = posts[0];
    const html = htmlFor(post.slug);
    const changed = html.replace(/(<title\b[^>]*>)[\s\S]*?(<\/title>)/, '$1Incorrect title$2');
    assert.notEqual(changed, html, 'mutation must change the document');
    assert.notDeepEqual(verifyArticleDocument(changed, post), []);
  });

  const mutations = [
    ['wrong heading with matching metadata', 'short', (html) => html.replace(/(<h1 data-article="title"[^>]*>)[\s\S]*?(<\/h1>)/, '$1Different heading$2')],
    ['hidden heading substitute', 'short', (html) => html.replace(/<h1 data-article="title"[^>]*>[\s\S]*?<\/h1>/, '<span hidden data-article="title">Brief</span>')],
    ['hidden article ancestor', 'short', (html) => html.replace('<div id="root">', '<div id="root" hidden>')],
    ['misplaced title marker', 'short', (html) => {
      const [heading] = html.match(/<h1 data-article="title"[^>]*>[\s\S]*?<\/h1>/);
      return html.replace(heading, '').replace('</section>', () => `</section>${heading}`);
    }],
    ['duplicate title markers', 'short', (html) => html.replace('</section>', '<h1 data-article="title">Brief</h1></section>')],
    ['duplicate body markers', 'short', (html) => html.replace('</section>', '<div data-article="body" class="prose"><p>Short.</p></div></section>')],
    ['another article sharing the opening', 'shared-opening', (html) => html.replace('Expected final paragraph.', 'Unrelated final paragraph.')],
    ['truncated article', 'shared-opening', (html) => html.replace('\n<p>Expected final paragraph.</p>', '')],
    ['extra article content', 'shared-opening', (html) => html.replace('<p>Expected final paragraph.</p>', '<p>Expected final paragraph.</p><p>Extra paragraph.</p>')],
    ['reordered paragraphs', 'shared-opening', (html) => html.replace('<p>Shared opening.</p>\n<p>Expected final paragraph.</p>', '<p>Expected final paragraph.</p>\n<p>Shared opening.</p>')],
    ['literal tags replaced with emphasis', 'literal-html', (html) => html.replace(/<p>Text [\s\S]*? after\.<\/p>/, '<p>Text <em>literal tag</em> after.</p>')],
    ['changed link destination', 'links', (html) => html.replace('href="https://example.invalid/guide?a=1&amp;b=2"', 'href="https://example.invalid/different"')],
    ['changed link title', 'links', (html) => html.replace('title="Quoted &amp; linked"', 'title="Different title"')],
    ['changed image alt text', 'image-fixture', (html) => html.replace('alt="Card &amp; holder"', 'alt="Different card"')],
    ['changed code whitespace', 'code', (html) => html.replace('  // Keep indentation.', '// Keep indentation.')],
    ['removed hard break', 'hard-break', (html) => html.replace('<br/>', '')],
    ['added resource hint inside prose', 'short', (html) => html.replace('<p>Short.</p>', '<link rel="preload" as="image" href="https://example.invalid/extra.jpg"><p>Short.</p>')],
    ['added meta inside prose', 'short', (html) => html.replace('<p>Short.</p>', '<meta name="unexpected" content="extra"><p>Short.</p>')],
    ['wrong canonical', 'image-fixture', (html) => html.replace('data-seo="canonical" rel="canonical" href="https://licollectorsco.com/blog/image-fixture"', 'data-seo="canonical" rel="canonical" href="https://licollectorsco.com/blog/other"')],
    ['wrong indexing', 'image-fixture', (html) => html.replace('name="robots" content="index, follow"', 'name="robots" content="noindex, follow"')],
    ['wrong description', 'image-fixture', (html) => html.replace('name="description" content="Fixture excerpt for image-fixture."', 'name="description" content="Different excerpt."')],
    ['wrong social title', 'image-fixture', (html) => html.replace('property="og:title" content="Image fixture | LI Collectors Co."', 'property="og:title" content="Different social title"')],
    ['wrong structured-data route', 'image-fixture', (html) => html.replace('"mainEntityOfPage":"https://licollectorsco.com/blog/image-fixture"', '"mainEntityOfPage":"https://licollectorsco.com/blog/other"')],
    ['missing structured data', 'image-fixture', (html) => html.replace(/<script data-seo="structured-data"[^>]*>[\s\S]*?<\/script>/, '')],
    ['duplicate canonical', 'image-fixture', (html) => html.replace('</head>', '<link data-seo="canonical" rel="canonical" href="https://licollectorsco.com/blog/image-fixture"></head>')],
    ['canonical outside head', 'image-fixture', (html) => {
      const [canonical] = html.match(/<link data-seo="canonical"[^>]*>/);
      return html.replace(canonical, '').replace('</body>', () => `${canonical}</body>`);
    }],
  ];
  for (const [name, slug, mutate] of mutations) {
    await t.test(`rejects ${name}`, () => {
      const post = posts.find((entry) => entry.slug === slug);
      const html = htmlFor(slug);
      const changed = mutate(html);
      assert.notEqual(changed, html, 'mutation must change the document');
      assert.notDeepEqual(verifyArticleDocument(changed, post), []);
    });
  }

  await t.test('hydration comments, attribute order, and hints outside prose do not change content', () => {
    const post = posts.find(({ slug }) => slug === 'links');
    const html = htmlFor(post.slug);
    const commented = html.replace('Grading &amp; prices</a>', 'Grading <!-- -->&amp; prices</a>');
    const reordered = commented.replace('href="https://example.invalid/guide?a=1&amp;b=2" title="Quoted &amp; linked"', 'title="Quoted &amp; linked" href="https://example.invalid/guide?a=1&amp;b=2"');
    const changed = reordered.replace('</head>', '<link rel="preload" as="image" href="https://example.invalid/other.jpg"></head>');
    assert.ok(commented !== html && reordered !== commented && changed !== reordered, 'each mutation must change the document');
    assert.deepEqual(verifyArticleDocument(changed, post), []);
  });
});

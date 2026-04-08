import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import ReactMarkdown from 'react-markdown';
import postsData from '../posts.json';

interface Post {
  id: string;
  slug: string;
  title: string;
  date: string;
  tags: string[];
  excerpt: string;
  body: string;
}

const BlogPost = () => {
  const { slug } = useParams<{ slug: string }>();
  const post = (postsData.posts as Post[]).find(p => p.slug === slug);

  if (!post) {
    return (
      <section className="min-h-screen bg-navy flex flex-col items-center justify-center text-center px-4">
        <Helmet>
          <title>Post Not Found | Long Island Collectors Co.</title>
        </Helmet>
        <h1 className="text-4xl font-bold text-white mb-4">Post Not Found</h1>
        <p className="text-gray-400 mb-8">The post you're looking for doesn't exist or may have been removed.</p>
        <Link to="/blog" className="px-8 py-3 bg-gold text-navy font-bold rounded shadow-gold-glow hover:bg-yellow-500 transition-colors uppercase tracking-wide">
          ← Back to Blog
        </Link>
      </section>
    );
  }

  const formattedDate = new Date(post.date + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <section className="min-h-screen bg-navy py-24 px-4">
      <Helmet>
        <title>{post.title} | Long Island Collectors Co.</title>
        <meta name="description" content={post.excerpt} />
        <meta property="og:title" content={`${post.title} | Long Island Collectors Co.`} />
        <meta property="og:description" content={post.excerpt} />
        <meta property="og:type" content="article" />
        <meta property="article:published_time" content={post.date} />
      </Helmet>

      <div className="max-w-3xl mx-auto">
        {/* Back link */}
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-10"
        >
          <Link to="/blog" className="inline-flex items-center gap-2 text-gold hover:text-white font-medium text-sm uppercase tracking-wider transition-colors duration-200">
            ← Back to Blog
          </Link>
        </motion.div>

        {/* Article Header */}
        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-12"
        >
          {/* Tags */}
          <div className="flex flex-wrap gap-2 mb-6">
            {post.tags.map(tag => (
              <span
                key={tag}
                className="text-xs font-bold uppercase tracking-widest bg-gold/10 text-gold border border-gold/20 px-3 py-1 rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>

          <h1 className="text-3xl md:text-5xl font-extrabold text-white leading-tight mb-4">
            {post.title}
          </h1>

          <p className="text-gold/60 text-sm font-medium tracking-wide">
            {formattedDate}
          </p>

          <div className="h-px bg-gold/20 mt-8" />
        </motion.header>

        {/* Article Body */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="prose prose-invert prose-lg max-w-none
            prose-headings:text-white prose-headings:font-bold
            prose-h1:text-4xl prose-h2:text-2xl prose-h2:text-gold prose-h3:text-xl prose-h3:text-gray-200
            prose-p:text-gray-300 prose-p:leading-relaxed prose-p:font-light
            prose-a:text-gold prose-a:no-underline hover:prose-a:text-white
            prose-strong:text-white
            prose-code:text-gold prose-code:bg-gold/10 prose-code:px-1 prose-code:rounded
            prose-blockquote:border-gold prose-blockquote:text-gray-400
            prose-table:text-gray-300 prose-th:text-gold prose-th:font-bold
            prose-li:text-gray-300
            prose-hr:border-gold/20"
        >
          <ReactMarkdown>{post.body}</ReactMarkdown>
        </motion.div>

        {/* Footer nav */}
        <div className="mt-16 pt-8 border-t border-gold/20 text-center">
          <Link to="/blog" className="inline-flex items-center gap-2 text-gold hover:text-white font-bold uppercase text-sm tracking-wider transition-colors duration-200">
            ← Back to Blog
          </Link>
        </div>
      </div>
    </section>
  );
};

export default BlogPost;

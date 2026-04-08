import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
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

const BlogIndex = () => {
  const posts: Post[] = [...postsData.posts].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <section className="min-h-screen bg-navy py-24 px-4">
      <Helmet>
        <title>Blog | Long Island Collectors Co.</title>
        <meta name="description" content="Collector tips, grading guides, market insights, and hobby news from the team at Long Island Collectors Co." />
      </Helmet>

      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h1 className="text-5xl md:text-6xl font-extrabold text-white mb-4">
            The <span className="text-gold [text-shadow:0_0_20px_rgba(212,175,55,0.4)]">Collector's</span> Blog
          </h1>
          <p className="text-xl text-gray-300 font-light max-w-2xl mx-auto">
            Grading guides, market insights, and hobby news from the Long Island Collectors Co. team.
          </p>
          <div className="h-1 w-24 bg-gold mx-auto mt-6 rounded shadow-gold-glow" />
        </motion.div>

        {posts.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20 text-gray-400 text-lg"
          >
            No posts yet. Check back soon.
          </motion.div>
        ) : (
          <div className="flex flex-col gap-8">
            {posts.map((post, index) => (
              <motion.article
                key={post.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-gradient-to-b from-[#0f2442] to-[#0A192F] border border-gold/10 hover:border-gold/50 rounded-2xl p-8 shadow-lg hover:shadow-gold-glow transition-all duration-300"
              >
                {/* Tags */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {post.tags.map(tag => (
                    <span
                      key={tag}
                      className="text-xs font-bold uppercase tracking-widest bg-gold/10 text-gold border border-gold/20 px-3 py-1 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Title */}
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-3 leading-tight">
                  <Link to={`/blog/${post.slug}`} className="hover:text-gold transition-colors duration-200">
                    {post.title}
                  </Link>
                </h2>

                {/* Date */}
                <p className="text-sm text-gold/60 mb-4 font-medium tracking-wide">
                  {new Date(post.date + 'T00:00:00').toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>

                {/* Excerpt */}
                <p className="text-gray-300 text-lg font-light leading-relaxed mb-6">
                  {post.excerpt}
                </p>

                <Link
                  to={`/blog/${post.slug}`}
                  className="inline-flex items-center gap-2 text-gold font-bold uppercase text-sm tracking-wider hover:text-white transition-colors duration-200"
                >
                  Read More →
                </Link>
              </motion.article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default BlogIndex;

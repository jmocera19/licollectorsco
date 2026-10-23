import { Link } from 'react-router-dom';
import Seo from '../components/Seo';
import { notFoundSeo } from '../../shared/seo.js';

const NOT_FOUND_SEO = notFoundSeo();

const NotFound = () => {
  return (
    <section className="min-h-screen bg-navy flex flex-col items-center justify-center text-center px-4">
      <Seo seo={NOT_FOUND_SEO} />
      <h1 className="text-4xl font-bold text-white mb-4">Page Not Found</h1>
      <p className="text-gray-400 mb-8">The page you're looking for doesn't exist or may have been removed.</p>
      <Link
        to="/"
        className="px-8 py-3 bg-gold text-navy font-bold rounded shadow-gold-glow hover:bg-yellow-500 transition-colors uppercase tracking-wide"
      >
        ← Back Home
      </Link>
    </section>
  );
};

export default NotFound;

import Navbar from './components/Navbar';
import Hero from './components/Hero';
import SellCollection from './components/SellCollection';
import Vault from './components/Vault';
import GradingInfo from './components/GradingInfo';
import AboutUs from './components/AboutUs';
import { motion, useScroll, useSpring } from 'framer-motion';
import { Helmet, HelmetProvider } from 'react-helmet-async';
import { initGA, useAnalytics } from './utils/useAnalytics';

// Initialize the GA layer once at root
initGA();

function App() {
  // Fire page_views tracking internally
  useAnalytics();

  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  return (
    <HelmetProvider>
      <Helmet>
        <title>Long Island Collectors Co. | We Buy & Sell Pokémon & Funko</title>
        <meta name="description" content="The premier destination for high-end graded Pokémon slabs and Funko Pops. Sell your collection to us for top dollar." />
        <meta property="og:title" content="Long Island Collectors Co. | We Buy & Sell Pokémon & Funko" />
        <meta property="og:description" content="The premier destination for high-end graded Pokémon slabs and Funko Pops. Sell your collection to us for top dollar." />
        <meta property="og:image" content="https://www.licollectorsco.com/assets/LogoSVG.svg" />
        <meta property="og:url" content="https://www.licollectorsco.com" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>
      
      <div className="min-h-screen bg-navy selection:bg-gold selection:text-navy font-sans">
        <motion.div
        className="fixed top-0 left-0 right-0 h-1 bg-gold z-50 origin-left"
        style={{ scaleX }}
      />
      <Navbar />
      <main className="space-y-4">
        <Hero />
        <SellCollection />
        <Vault />
        <GradingInfo />
        <AboutUs />
      </main>
      
      <footer className="bg-[#050c18] border-t border-gold/20 py-10 text-center flex flex-col items-center gap-4">
        {/* Social Links */}
        <div className="flex items-center gap-6">
          {/* Instagram */}
          <a href="https://www.instagram.com/licollectorsco" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="text-gold hover:text-white transition-colors duration-300">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
              <circle cx="12" cy="12" r="4"/>
              <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
            </svg>
          </a>
          {/* TikTok */}
          <a href="https://www.tiktok.com/@licollectorsco" target="_blank" rel="noopener noreferrer" aria-label="TikTok" className="text-gold hover:text-white transition-colors duration-300">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.19 8.19 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/>
            </svg>
          </a>
          {/* YouTube */}
          <a href="https://www.youtube.com/@LongIslandCollectorsCo" target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="text-gold hover:text-white transition-colors duration-300">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.38.55A3.02 3.02 0 0 0 .5 6.19 31.7 31.7 0 0 0 0 12a31.7 31.7 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14C4.46 20.5 12 20.5 12 20.5s7.54 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14A31.7 31.7 0 0 0 24 12a31.7 31.7 0 0 0-.5-5.81zM9.75 15.5v-7l6.5 3.5-6.5 3.5z"/>
            </svg>
          </a>
        </div>
        <a href="mailto:info@licollectorsco.com" className="text-gold hover:text-white font-medium tracking-wide transition-colors duration-300">
          info@licollectorsco.com
        </a>
        <p className="text-gray-500 font-light text-sm">© {new Date().getFullYear()} Long Island Collectors Co. All rights reserved.</p>
      </footer>
      </div>
    </HelmetProvider>
  );
}

export default App;

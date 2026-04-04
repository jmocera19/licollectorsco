import Navbar from './components/Navbar';
import Hero from './components/Hero';
import SellCollection from './components/SellCollection';
import Vault from './components/Vault';
import GradingInfo from './components/GradingInfo';
import AboutUs from './components/AboutUs';
import { motion, useScroll, useSpring } from 'framer-motion';
import { Helmet, HelmetProvider } from 'react-helmet-async';

function App() {
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

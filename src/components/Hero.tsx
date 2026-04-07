import { motion } from 'framer-motion';

const Hero = () => {
  return (
    <section 
      className="relative min-h-[80vh] flex flex-col justify-center items-center text-center px-4 overflow-hidden"
      style={{
        background: `
          radial-gradient(ellipse at 70% 50%, rgba(212,175,55,0.08) 0%, transparent 60%),
          radial-gradient(ellipse at 30% 80%, rgba(212,175,55,0.05) 0%, transparent 50%),
          linear-gradient(135deg, #0A192F 0%, #0d2137 50%, #0A192F 100%)
        `
      }}
    >
      {/* Background overlay/fx */}
      <div className="absolute inset-0 bg-navy bg-opacity-80 z-0"></div>
      <div className="absolute inset-0 bg-gradient-to-t from-navy to-transparent z-0"></div>
      
      <motion.div 
        className="relative z-10 max-w-4xl mx-auto"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        <motion.h1 
          className="text-5xl md:text-7xl font-['Inter'] font-extrabold text-white mb-6 tracking-wide"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          Long Island <span className="text-gold [text-shadow:0_0_20px_rgba(212,175,55,0.4)]">Collectors Co.</span>
        </motion.h1>
        
        <motion.p 
          className="text-xl md:text-2xl text-gray-300 mb-10 max-w-2xl mx-auto font-light"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
        >
          Premium Breaks, Slabs, and Collectibles. Curated for the modern collector.
        </motion.p>
        
        <motion.div 
          className="flex flex-col sm:flex-row justify-center gap-6 sm:gap-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          <a href="#sell" className="px-8 py-4 bg-gold text-navy font-bold text-lg rounded shadow-gold-glow hover:scale-105 transition-transform duration-300 uppercase tracking-wide">
            Sell Your Collection
          </a>
          <a href="https://www.ebay.com/usr/longislandcollectorsco" target="_blank" rel="noreferrer" className="px-8 py-4 border-2 border-gold text-gold font-bold text-lg rounded hover:bg-gold/10 hover:shadow-gold-glow transition-all duration-300 uppercase tracking-wide">
            Shop our eBay Store
          </a>
        </motion.div>
      </motion.div>
    </section>
  );
};

export default Hero;

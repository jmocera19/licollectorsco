import { motion } from 'framer-motion';
import data from '../data.json';

const Vault = () => {
  const items = data.vault;

  return (
    <section id="vault" className="py-24 px-4 bg-navy">
      <div className="max-w-7xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            The <span className="text-gold">Vault</span>
          </h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto font-light leading-relaxed">
            Exclusive slabs, pops, and premium singles officially available directly on our storefront.
          </p>
          <div className="h-1 w-24 bg-gold mx-auto mt-6 rounded shadow-gold-glow"></div>
        </motion.div>

        {items.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#0f2442] border border-gold/30 rounded-2xl p-12 text-center shadow-2xl max-w-2xl mx-auto"
          >
            <h3 className="text-2xl md:text-3xl font-serif text-white mb-4">
              The Vault is currently being restocked.
            </h3>
            <p className="text-gold font-light tracking-wide text-lg">
              Check back soon for new Grails! 
            </p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {items.map((item, index) => {
              const gradeMatch = item.title.match(/(PSA|TAG|BGS|CGC)\s*\d+(?:\.\d)?/i);
              const badge = gradeMatch ? gradeMatch[0].toUpperCase() : null;

              return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: Math.min(index * 0.1, 0.5) }}
                className="bg-gradient-to-b from-[#0f2442] to-[#0A192F] rounded-xl p-4 border border-gold/10 hover:border-gold/60 shadow-lg hover:shadow-gold-glow transition-all duration-300 flex flex-col"
              >
                <div className="relative aspect-[4/5] min-h-[300px] mb-4 bg-[#0a1526] rounded-lg overflow-hidden flex items-center justify-center p-2">
                  <img 
                    src={item.image} 
                    alt={item.title} 
                    loading="lazy"
                    className="w-full h-full object-cover filter drop-shadow-[0_10px_10px_rgba(0,0,0,0.5)] rounded"
                  />
                  <div className="absolute top-2 right-2 flex flex-col gap-2 items-end z-10">
                    <div className="bg-navy/90 backdrop-blur border border-gold text-gold font-bold px-3 py-1 rounded-full shadow-gold-glow">
                      {item.price}
                    </div>
                    {badge && (
                      <div className="bg-gold text-navy font-black text-xs px-2 py-1 rounded shadow-gold-glow uppercase tracking-widest whitespace-nowrap">
                        {badge}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex-1 flex flex-col justify-between">
                  <h3 className="text-sm font-semibold text-white leading-tight mb-4 line-clamp-2" title={item.title}>
                    {item.title}
                  </h3>
                  <a 
                    href={item.url} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="block w-full py-3 text-center bg-gold text-navy font-bold rounded shadow-gold-glow hover:bg-yellow-500 hover:scale-105 transition-all"
                  >
                    View on eBay
                  </a>
                </div>
              </motion.div>
            );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default Vault;

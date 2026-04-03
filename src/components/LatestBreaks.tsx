import { motion } from 'framer-motion';
import { Play } from 'lucide-react';
import data from '../data.json';

const LatestBreaks = () => {
  return (
    <section id="breaks" className="py-20 px-4 bg-navy/95 border-t border-navy">
      <div className="max-w-7xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Latest <span className="text-gold">Breaks</span></h2>
          <div className="h-1 w-24 bg-gold mx-auto rounded shadow-gold-glow"></div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {data.breaks.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="bg-[#0f2442] rounded-xl overflow-hidden shadow-lg border border-gold/10 group cursor-pointer hover:border-gold/50 hover:shadow-gold-glow transition-all duration-300"
            >
              <div className="relative aspect-video overflow-hidden">
                <img 
                  src={item.thumbnail} 
                  alt={item.title} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-navy/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="bg-gold p-4 rounded-full text-navy shadow-gold-glow">
                    <Play className="fill-current" size={24} />
                  </div>
                </div>
              </div>
              <div className="p-6">
                <h3 className="text-xl font-bold text-gray-100 group-hover:text-gold transition-colors">{item.title}</h3>
                <a href={item.url} target="_blank" rel="noreferrer" className="inline-block mt-4 text-sm font-semibold uppercase tracking-wider text-gold hover:text-white transition-colors">
                  Watch on YouTube →
                </a>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default LatestBreaks;

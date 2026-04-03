import { motion } from 'framer-motion';
import { ShieldCheck, TrendingUp, PackageSearch } from 'lucide-react';
import data from '../data.json';

const GradingInfo = () => {
  return (
    <section id="grading" className="py-24 px-4 bg-navy/95 border-t border-gold/10 relative overflow-hidden">
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-gold rounded-full mix-blend-multiply filter blur-3xl opacity-10 blur-2xl"></div>
      
      <div className="max-w-7xl mx-auto relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">{data.grading.title}</h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto font-light leading-relaxed">
            {data.grading.description}
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 mt-12 text-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="p-8 rounded-2xl bg-[#0f2442] border border-gold/20 hover:border-gold/60 hover:shadow-gold-glow transition-all duration-300"
          >
            <div className="w-16 h-16 mx-auto mb-6 bg-gold/10 rounded-full flex items-center justify-center text-gold">
              <ShieldCheck size={32} />
            </div>
            <h3 className="text-2xl font-bold text-white mb-4">Insured & Secure</h3>
            <p className="text-gray-400">Every card we handle is stored securely and fully insured during transit to grading facilities.</p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="p-8 rounded-2xl bg-[#0f2442] border border-gold/20 hover:border-gold/60 hover:shadow-gold-glow transition-all duration-300"
          >
            <div className="w-16 h-16 mx-auto mb-6 bg-gold/10 rounded-full flex items-center justify-center text-gold">
              <PackageSearch size={32} />
            </div>
            <h3 className="text-2xl font-bold text-white mb-4">Pre-Screening</h3>
            <p className="text-gray-400">Our experts carefully pre-screen your raw cards to estimate grades before submission.</p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="p-8 rounded-2xl bg-[#0f2442] border border-gold/20 hover:border-gold/60 hover:shadow-gold-glow transition-all duration-300"
          >
            <div className="w-16 h-16 mx-auto mb-6 bg-gold/10 rounded-full flex items-center justify-center text-gold">
              <TrendingUp size={32} />
            </div>
            <h3 className="text-2xl font-bold text-white mb-4">Maximize Value</h3>
            <p className="text-gray-400">Determine the right grading service (PSA/TAG) to maximize return on your investment.</p>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default GradingInfo;

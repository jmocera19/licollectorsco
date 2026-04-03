import { motion } from 'framer-motion';
import { DollarSign, Package } from 'lucide-react';
import SellForm from './SellForm';

const SellCollection = () => {
  return (
    <section id="sell" className="py-24 px-4 bg-gradient-to-b from-navy to-[#050c18] border-t border-gold/10">
      <div className="max-w-7xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Looking to <span className="text-gold">Sell?</span>
          </h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto font-light leading-relaxed">
            We Buy Pokémon & Funko Collections for Top Dollar. Secure quotes, fast payments.
          </p>
          <div className="h-1 w-24 bg-gold mx-auto mt-6 rounded shadow-gold-glow"></div>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12 items-start">
          {/* Informational Side */}
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="space-y-8 lg:sticky lg:top-32"
          >
            <div className="bg-[#0f2442] p-6 rounded-xl border border-gold/20 flex gap-4">
              <div className="mt-1 bg-gold/10 p-3 rounded-full h-fit">
                <Package className="text-gold" size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-2">Any Size Collection</h3>
                <p className="text-gray-400">Whether it's a few high-end slabs or an entire room of binders and sealed product, we are interested.</p>
              </div>
            </div>

            <div className="bg-[#0f2442] p-6 rounded-xl border border-gold/20 flex gap-4">
              <div className="mt-1 bg-gold/10 p-3 rounded-full h-fit">
                <DollarSign className="text-gold" size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-2">Fair Market Offers</h3>
                <p className="text-gray-400">We utilize current market data to provide competitive offers. Skip the eBay fees and hassle of individual shipping.</p>
              </div>
            </div>
          </motion.div>

          {/* Form Side */}
          <motion.div 
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="bg-white/5 backdrop-blur rounded-2xl border border-gold/30 shadow-2xl relative min-h-[600px] overflow-hidden"
          >
             <div className="absolute -inset-0.5 bg-gradient-to-r from-gold to-[rgba(212,175,55,0.2)] rounded-2xl blur opacity-20 z-0"></div>
             <div className="relative z-10 w-full h-full p-2 lg:p-4">
               <SellForm />
             </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default SellCollection;

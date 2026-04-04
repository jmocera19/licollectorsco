import { motion } from 'framer-motion';
// @ts-ignore
import logo from '../assets/LogoSVG.svg';

const AboutUs = () => {
  return (
    <section id="about" className="py-24 px-4 bg-navy border-t border-gold/10 relative overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          
          {/* Logo Placeholder / Image */}
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="flex justify-center lg:justify-start"
          >
            <div className="relative aspect-square max-w-md w-full bg-[#0a1526] p-12 rounded-2xl border border-gold/20 shadow-[0_0_30px_rgba(212,175,55,0.1)] flex items-center justify-center">
               <img 
                 src={logo} 
                 alt="Long Island Collectors Co. Logo" 
                 loading="lazy"
                 className="w-full h-auto object-contain filter drop-shadow-[0_0_15px_rgba(212,175,55,0.3)] hover:scale-105 transition-transform duration-500" 
               />
            </div>
          </motion.div>

          {/* Text Content */}
          <motion.div 
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex flex-col text-center lg:text-left"
          >
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
              The Story Behind the <span className="text-gold">Vault</span>
            </h2>
            <div className="h-1 w-24 bg-gold mx-auto lg:mx-0 mb-8 rounded shadow-gold-glow"></div>
            
            <p className="text-gray-300 text-lg font-light leading-relaxed mb-6">
              Long Island Collectors Co. isn't just a business—it's a family passion. Based in the heart of Islip, NY, we've spent years hunting for "grails" and building a community around the hobbies we love.
            </p>
            <p className="text-gray-300 text-lg font-light leading-relaxed mb-10">
              What started as a personal obsession with Pokémon and Funko Pops has grown into a dedicated mission to provide collectors with high-end, accurately graded slabs and rare finds. As a family-owned and operated business, we treat every card in the Vault with the same respect we give our own personal collections. Whether you're looking to buy your next centerpiece or sell a lifetime of memories, we're here to ensure the hobby stays transparent, professional, and—above all—fun.
            </p>

            <div className="mt-2 text-center lg:text-left">
              <a 
                href="mailto:info@licollectorsco.com" 
                className="inline-flex items-center justify-center px-10 py-4 bg-gold text-navy font-bold text-lg rounded shadow-gold-glow hover:scale-105 transition-transform duration-300 uppercase tracking-widest"
              >
                Reach Out
              </a>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
};

export default AboutUs;

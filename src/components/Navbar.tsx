import { Menu, X } from 'lucide-react';
import { useState } from 'react';
// @ts-ignore
import logo from '../assets/LogoSVG.svg';
import data from '../data.json';

const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="border-b border-gold/20 bg-navy/95 backdrop-blur-md sticky top-0 z-40 w-full shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-5 md:py-6">
          
          {/* Logo Container */}
          <div className="flex-shrink-0 flex items-center cursor-pointer mr-6 z-50">
            <a href="#" className="flex items-center gap-4">
              <img src={logo} alt="Long Island Collectors Co. crest logo" className="h-16 md:h-20 w-auto object-contain drop-shadow-[0_0_15px_rgba(212,175,55,0.2)]" />
              <span className="hidden sm:block text-gold text-xl md:text-2xl font-['Inter'] font-bold tracking-wider text-shadow-sm">
                Long Island Collectors Co.
              </span>
            </a>
          </div>
          
          {/* Desktop Menu */}
          <div className="hidden md:flex space-x-6 lg:space-x-8 items-center flex-nowrap shrink-0">
            <a href="#sell" className="text-navy bg-gold px-4 py-2 rounded-md hover:bg-yellow-500 shadow-gold-glow transition-all font-bold uppercase tracking-wide text-sm whitespace-nowrap">
              Sell to Us
            </a>
            <a href="#vault" className="text-gray-300 hover:text-gold transition-colors font-medium uppercase text-sm tracking-wider whitespace-nowrap">
              The Vault
            </a>
            <a href={data.livestream.url} target="_blank" rel="noreferrer" className="text-gray-300 hover:text-gold transition-colors font-medium uppercase text-sm tracking-wider whitespace-nowrap">
              Our eBay Store
            </a>
            <a href="/blog" className="text-gray-300 hover:text-gold transition-colors font-medium uppercase text-sm tracking-wider whitespace-nowrap">
              Blog
            </a>
            <a href="mailto:info@licollectorsco.com" className="text-gray-300 hover:text-gold transition-colors font-medium uppercase text-sm tracking-wider whitespace-nowrap">
              Contact
            </a>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center z-50">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-gold hover:text-white focus:outline-none p-2 bg-navy/50 rounded-lg backdrop-blur"
              aria-label="Toggle menu"
            >
              {isMenuOpen ? <X size={28} /> : <Menu size={28} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {isMenuOpen && (
        <div className="md:hidden absolute top-full left-0 w-full bg-navy border-b border-gold/20 shadow-[0_10px_20px_rgba(212,175,55,0.15)] flex flex-col z-40">
          <div className="px-4 py-6 space-y-4">
            <a 
              onClick={() => setIsMenuOpen(false)} 
              href="#sell" 
              className="block text-center text-navy bg-gold p-3 rounded font-bold text-lg uppercase shadow-gold-glow"
            >
              Sell to Us
            </a>
            <a 
              onClick={() => setIsMenuOpen(false)} 
              href="#vault" 
              className="block text-center text-gray-300 hover:text-gold py-3 text-lg uppercase border-b border-gold/10"
            >
              The Vault
            </a>
            <a 
              onClick={() => setIsMenuOpen(false)} 
              href={data.livestream.url} 
              target="_blank" 
              rel="noreferrer" 
              className="block text-center text-gray-300 hover:text-gold py-3 text-lg uppercase border-b border-gold/10"
            >
              Our eBay Store
            </a>
            <a 
              onClick={() => setIsMenuOpen(false)} 
              href="/blog" 
              className="block text-center text-gray-300 hover:text-gold py-3 text-lg uppercase border-b border-gold/10"
            >
              Blog
            </a>
            <a 
              onClick={() => setIsMenuOpen(false)} 
              href="mailto:info@licollectorsco.com" 
              className="block text-center text-gray-300 hover:text-gold py-3 text-lg uppercase"
            >
              Contact
            </a>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;

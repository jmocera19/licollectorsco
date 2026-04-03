import { motion, AnimatePresence } from 'framer-motion';
import { PlayCircle, X } from 'lucide-react';
import { useState } from 'react';
import data from '../data.json';

const StreamBanner = () => {
  const [isVisible, setIsVisible] = useState(data.livestream.isLive);

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -50, opacity: 0 }}
        className="bg-gold text-navy font-bold py-2 px-4 shadow-[0_0_15px_rgba(212,175,55,0.4)] relative z-50 flex items-center justify-between"
      >
        <div className="flex-1 flex justify-center items-center space-x-2">
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            <PlayCircle className="text-red-600 fill-red-600/20" size={20} />
          </motion.div>
          <span>Live Now on {data.livestream.platform}!</span>
          <a
            href={data.livestream.url}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-white transition-colors"
          >
            Join the stream
          </a>
        </div>
        <button onClick={() => setIsVisible(false)} className="text-navy hover:text-white transition-colors">
          <X size={20} />
        </button>
      </motion.div>
    </AnimatePresence>
  );
};

export default StreamBanner;

const path = require('path');

// Manager-specific Tailwind configuration. Content paths are absolute
// (__dirname-based) so generation works regardless of the working directory.
// All class tokens used by manager/index.html and manager/renderer.js appear
// as complete literal strings in those files, so no safelist is required.
module.exports = {
  content: [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'renderer.js'),
  ],
  theme: {
    extend: {
      colors: {
        navy: '#0A192F',
        gold: '#D4AF37',
      },
      fontFamily: {
        sans: ['system-ui', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

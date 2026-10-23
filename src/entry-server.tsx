import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import App from './App';

// Build-time only. `url` is the route being prerendered; the same app tree is
// hydrated in the browser against this markup.
export const render = (url: string) => renderToString(
  <StaticRouter location={url}>
    <App />
  </StaticRouter>,
);

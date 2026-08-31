import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import ReactGA from 'react-ga4';

let gaInitialized = false;

export const initGA = () => {
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;
  if (measurementId) {
    ReactGA.initialize(measurementId, {
      gtagOptions: {
        send_page_view: false,
      },
    });
    gaInitialized = true;
  } else {
    console.warn("GA4 Measurement ID is missing in the environment variables!");
  }
};

export const useAnalytics = () => {
  const location = useLocation();

  useEffect(() => {
    if (!gaInitialized) return;

    // Hash-only navigation changes sections on the same page and should not inflate page views.
    const currentPath = location.pathname + location.search;
    const frame = window.requestAnimationFrame(() => {
      ReactGA.send({
        hitType: 'pageview',
        page: currentPath,
        title: document.title,
        location: window.location.href,
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!gaInitialized) return;

    const trackLinkClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest<HTMLAnchorElement>('a[href]');
      if (!anchor) return;

      const linkLocation = anchor.closest('nav') ? 'navigation' : anchor.closest('footer') ? 'footer' : 'content';

      if (anchor.href.startsWith('mailto:')) {
        ReactGA.event('email_click', { link_location: linkLocation });
        return;
      }

      const url = new URL(anchor.href, window.location.href);
      if (url.hostname === 'ebay.com' || url.hostname.endsWith('.ebay.com')) {
        ReactGA.event('ebay_outbound_click', {
          link_location: linkLocation,
          link_text: anchor.textContent?.trim() || 'eBay link',
          link_url: url.href,
        });
      }
    };

    document.addEventListener('click', trackLinkClick);
    return () => document.removeEventListener('click', trackLinkClick);
  }, []);
};

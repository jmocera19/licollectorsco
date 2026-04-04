import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import ReactGA from 'react-ga4';

export const initGA = () => {
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;
  if (measurementId) {
    ReactGA.initialize(measurementId);
  } else {
    console.warn("GA4 Measurement ID is missing in the environment variables!");
  }
};

export const useAnalytics = () => {
  const location = useLocation();

  useEffect(() => {
    // We combine pathname, search, and hash to generate a highly granular view path (e.g. /#sell or /#vault)
    const currentPath = location.pathname + location.search + location.hash;
    ReactGA.send({ hitType: "pageview", page: currentPath });
  }, [location]);
};

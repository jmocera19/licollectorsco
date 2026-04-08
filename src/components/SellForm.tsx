import { useEffect } from 'react';

const SellForm = () => {
  useEffect(() => {
    // Inject the Youform script on mount
    const script = document.createElement('script');
    script.src = 'https://app.youform.com/embed.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      // Cleanup script on unmount
      document.body.removeChild(script);
    };
  }, []);

  return (
    <div className="w-full min-h-[600px] flex justify-center items-center">
      <div 
        data-youform-embed 
        data-form="fhxswrga" 
        data-base-url="https://app.youform.com" 
        data-width="100%"
        data-height="700"
        className="w-full"
      ></div>
    </div>
  );
};

export default SellForm;

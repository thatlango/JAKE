import { useState, useEffect } from 'react';

export default function InstallPrompt() {
  const [prompt, setPrompt] = useState(null);
  const [shown, setShown] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('jake_install_dismissed') === '1'
  );
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Already installed as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // iOS detection
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(ios);

    // Android/Chrome install prompt
    const handler = (e) => {
      e.preventDefault();
      setPrompt(e);
      setShown(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Show iOS instructions after 3s if on iOS and not dismissed
    if (ios && !dismissed) {
      setTimeout(() => setShown(true), 3000);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [dismissed]);

  const install = async () => {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setShown(false);
    }
  };

  const dismiss = () => {
    setShown(false);
    setDismissed(true);
    localStorage.setItem('jake_install_dismissed', '1');
  };

  if (isInstalled || dismissed || !shown) return null;

  return (
    <div className="install-banner">
      <div style={{ fontSize: 28 }}>📱</div>
      <div className="install-banner-text">
        <div><strong>Install JAKE</strong></div>
        <div className="install-banner-sub">
          {isIOS
            ? 'Tap Share → Add to Home Screen'
            : 'Add to home screen for offline access + SMS sharing'}
        </div>
      </div>
      {!isIOS && (
        <button className="install-btn" onClick={install}>Install</button>
      )}
      <button className="install-dismiss" onClick={dismiss}>×</button>
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { Camera, Search, Package, X, QrCode } from 'lucide-react';

const getApiBase = () => (typeof window !== 'undefined' ? window.location.origin : '');
const getToken = () => {
  try {
    return localStorage.getItem('retailos_token') || localStorage.getItem('token') || '';
  } catch {
    return '';
  }
};
const headers = () => ({
  Authorization: `Bearer ${getToken()}`,
  'Content-Type': 'application/json',
});

export default function BarcodeScannerTab() {
  const api = getApiBase();
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [result, setResult] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [error, setError] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => () => stopCamera(), []);

  const startCamera = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setScanning(true);
    } catch {
      setError('Camera access denied. Use manual entry instead.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setScanning(false);
  };

  const lookupBarcode = async (code) => {
    if (!code) return;
    setError('');
    setResult(null);
    try {
      const resp = await fetch(`${api}/api/mobile/barcode/${encodeURIComponent(code)}`, {
        headers: headers(),
      });
      const data = await resp.json();
      if (data.found) {
        setResult(data);
      } else {
        setError(`No product found for barcode: ${code}`);
      }
    } catch {
      setError('Failed to lookup barcode. Check your connection.');
    }
  };

  const searchProducts = async (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const resp = await fetch(
        `${api}/api/mobile/barcode/search?q=${encodeURIComponent(query)}`,
        { headers: headers() }
      );
      const data = await resp.json();
      setSearchResults(data.results || []);
    } catch {
      setSearchResults([]);
    }
  };

  const handleManualSubmit = (event) => {
    event.preventDefault();
    if (manualCode.trim()) lookupBarcode(manualCode.trim());
  };

  useEffect(() => {
    if (!scanning || !videoRef.current || !('BarcodeDetector' in window)) return;

    const detector = new window.BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'],
    });

    let animationId;
    const detect = async () => {
      if (!videoRef.current || !scanning) return;
      try {
        const barcodes = await detector.detect(videoRef.current);
        if (barcodes.length > 0) {
          const code = barcodes[0].rawValue;
          setManualCode(code);
          lookupBarcode(code);
          stopCamera();
          return;
        }
      } catch {
        // Ignore detection errors.
      }
      animationId = requestAnimationFrame(detect);
    };

    const onPlaying = () => {
      animationId = requestAnimationFrame(detect);
    };

    videoRef.current.addEventListener('playing', onPlaying);
    return () => {
      cancelAnimationFrame(animationId);
      if (videoRef.current) videoRef.current.removeEventListener('playing', onPlaying);
    };
  }, [scanning]);

  return (
    <div className="space-y-6">
      <div className="atelier-paper rounded-[28px] p-6">
        <div className="atelier-label text-[10px] text-[var(--ink-muted)]">Barcode Scanner</div>
        <h2 className="mt-2 font-display text-3xl font-bold text-[var(--ink)]">Scan products into the same command center</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--ink-muted)]">
          Camera lookup, manual barcode entry, and product search now follow the same warm atelier palette as the rest of the dashboard.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="atelier-panel rounded-[28px] p-6 text-[var(--text)]">
          {!scanning ? (
            <div className="text-center">
              <button
                onClick={startCamera}
                className="inline-flex items-center gap-2 rounded-2xl bg-[var(--accent)] px-6 py-3 font-black text-[#003738] transition-all hover:brightness-105"
              >
                <Camera size={18} />
                Open Camera Scanner
              </button>
              <p className="mt-3 text-sm text-[var(--text-muted)]">Point your device at a barcode to scan live inventory.</p>
            </div>
          ) : (
            <div className="relative">
              <video ref={videoRef} autoPlay playsInline className="w-full max-h-64 rounded-2xl bg-black" />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-32 w-48 rounded-2xl border-2 border-[var(--accent)] opacity-70" />
              </div>
              <button
                onClick={stopCamera}
                className="absolute right-3 top-3 rounded-full bg-[var(--danger)] p-2 text-[var(--primary-ink)]"
              >
                <X size={14} />
              </button>
              {!('BarcodeDetector' in window) && (
                <p className="mt-3 text-xs text-[var(--warning)]">Browser barcode detection is not supported here. Manual entry still works below.</p>
              )}
            </div>
          )}
        </div>

        <div className="atelier-paper rounded-[28px] p-6">
          <form onSubmit={handleManualSubmit} className="flex gap-3">
            <input
              className="atelier-input-light flex-1"
              placeholder="Enter barcode or product name..."
              value={manualCode}
              onChange={(e) => {
                setManualCode(e.target.value);
                searchProducts(e.target.value);
              }}
            />
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-2xl bg-[var(--primary)] px-4 py-2.5 text-sm font-black text-[var(--primary-ink)] transition-all hover:brightness-105"
            >
              <Search size={16} />
              Lookup
            </button>
          </form>

          {searchResults.length > 0 && !result && (
            <div className="mt-3 overflow-hidden rounded-2xl border border-black/5 bg-white/75">
              {searchResults.map((product, index) => (
                <button
                  key={index}
                  className="w-full border-b border-black/5 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-white"
                  onClick={() => {
                    setResult({ ...product, found: true });
                    setSearchResults([]);
                  }}
                >
                  <div className="text-sm font-semibold text-[var(--ink)]">{product.product_name}</div>
                  <div className="mt-1 text-xs text-[var(--ink-muted)]">
                    {product.sku} | Rs {(product.unit_price || 0).toFixed(2)} | Stock: {product.current_stock}
                  </div>
                </button>
              ))}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-2xl border border-[rgba(255,180,171,0.2)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--primary-ink)]">
              {error}
            </div>
          )}
        </div>
      </div>

      {result && (
        <div className="atelier-paper-strong rounded-[28px] p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <Package size={28} />
            </div>
            <div className="flex-1">
              <h3 className="text-2xl font-black text-[var(--ink)]">{result.product_name}</h3>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div><span className="text-[var(--ink-muted)]">SKU:</span> <span className="font-mono text-[var(--ink)]">{result.sku}</span></div>
                <div><span className="text-[var(--ink-muted)]">Category:</span> <span className="text-[var(--ink)]">{result.category}</span></div>
                <div><span className="text-[var(--ink-muted)]">Price:</span> <span className="font-bold text-[var(--primary-ink)]">Rs {(result.unit_price || 0).toFixed(2)}</span></div>
                <div><span className="text-[var(--ink-muted)]">Stock:</span> <span className="text-[var(--ink)]">{result.current_stock} units</span></div>
                {result.barcode && (
                  <div className="sm:col-span-2">
                    <span className="text-[var(--ink-muted)]">Barcode:</span> <span className="font-mono text-[var(--ink)]">{result.barcode}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <button
            className="mt-5 text-sm font-semibold text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
            onClick={() => {
              setResult(null);
              setManualCode('');
            }}
          >
            Clear result
          </button>
        </div>
      )}
    </div>
  );
}

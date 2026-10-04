import { NetworkDiagnostics } from './types';

export function getNetworkDiagnostics(): NetworkDiagnostics {
  if (typeof window === 'undefined') {
    return { online: true };
  }

  const nav = navigator as any;
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;

  return {
    online: navigator.onLine,
    type: conn?.type || 'unknown',
    effectiveType: conn?.effectiveType || (navigator.onLine ? '4g' : 'offline'),
    downlink: conn?.downlink,
    rtt: conn?.rtt,
    saveData: conn?.saveData,
  };
}

export function subscribeToNetworkChanges(callback: (diag: NetworkDiagnostics) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleUpdate = () => {
    callback(getNetworkDiagnostics());
  };

  window.addEventListener('online', handleUpdate);
  window.addEventListener('offline', handleUpdate);

  const nav = navigator as any;
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
  if (conn) {
    conn.addEventListener('change', handleUpdate);
  }

  return () => {
    window.removeEventListener('online', handleUpdate);
    window.removeEventListener('offline', handleUpdate);
    if (conn) {
      conn.removeEventListener('change', handleUpdate);
    }
  };
}

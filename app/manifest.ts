import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'زمام - معمل اختبار شبكة الهاتف',
    short_name: 'زمام خلوي',
    description: 'معمل تشخيص واختبار أداء تتبع السائق الميداني عبر بيانات الهاتف الخلوي وشبكات 4G/5G.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#0F766E',
    orientation: 'portrait',
    lang: 'ar',
    dir: 'rtl',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}

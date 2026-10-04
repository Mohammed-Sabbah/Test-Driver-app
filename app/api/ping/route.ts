import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const forwardedFor = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'direct';
  const clientIp = forwardedFor.split(',')[0].trim();
  const userAgent = req.headers.get('user-agent') || 'unknown';
  const carrierHost = req.headers.get('host') || 'unknown';
  const now = Date.now();

  return NextResponse.json({
    status: 'ok',
    serverTime: now,
    clientIp,
    carrierHost,
    userAgent,
    headers: {
      connection: req.headers.get('connection'),
      upgrade: req.headers.get('upgrade'),
      secFetchMode: req.headers.get('sec-fetch-mode'),
      acceptEncoding: req.headers.get('accept-encoding'),
    },
    message: 'خادم معمل زمام الخلوي يعمل بكفاءة وقابل للوصول عبر الإنترنت.',
  });
}

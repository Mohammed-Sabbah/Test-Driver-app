import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  // محاكاة تحميل بلاطات خريطة بحجم 250 كيلوبايت
  const sizeKb = Number(req.nextUrl.searchParams.get('kb')) || 250;
  const chunk = 'X'.repeat(1024); // 1 KB string
  const dummyData = chunk.repeat(sizeKb);

  return new NextResponse(dummyData, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
      'Content-Length': String(dummyData.length),
      'Cache-Control': 'no-store',
    },
  });
}

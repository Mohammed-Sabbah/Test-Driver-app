import { NextRequest, NextResponse } from 'next/server';
import { DriverTelemetryPayload } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const batch: DriverTelemetryPayload[] = body?.batch || [];
    const serverTime = Date.now();

    if (!Array.isArray(batch) || batch.length === 0) {
      return NextResponse.json(
        { success: false, message: 'دفعة البيانات فارغة أو غير صالحة' },
        { status: 400 }
      );
    }

    const sorted = [...batch].sort((a, b) => a.timestamp - b.timestamp);
    const oldestTimestamp = sorted[0]?.timestamp || serverTime;
    const maxAgeMs = serverTime - oldestTimestamp;

    return NextResponse.json({
      success: true,
      processedCount: batch.length,
      serverTime,
      oldestPointAgeMs: maxAgeMs,
      message: `تم استلام ومزامنة ${batch.length} نقطة بنجاح من الطابور المحلي.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: 'فشلت معالجة دفعة البيانات', error: err.message },
      { status: 500 }
    );
  }
}

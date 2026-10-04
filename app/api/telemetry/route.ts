import { NextRequest, NextResponse } from 'next/server';
import { DriverTelemetryPayload, TelemetryServerResponse } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body: DriverTelemetryPayload = await req.json();
    const serverTime = Date.now();

    if (!body || typeof body.lat !== 'number' || typeof body.lng !== 'number') {
      return NextResponse.json(
        { success: false, message: 'إحداثيات غير صالحة' },
        { status: 400 }
      );
    }

    const transitDelayMs = Math.max(0, serverTime - (body.timestamp || serverTime));

    const responseData: TelemetryServerResponse = {
      success: true,
      clientSeq: body.clientSeq,
      serverTime,
      transitDelayMs,
      processedCount: 1,
      message: `تم استقبال نبضة المركبة ${body.vehicleId} بنجاح (تأخير النقل: ${transitDelayMs}ms)`,
    };

    return NextResponse.json(responseData, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        message: 'خطأ في معالجة ريكويست التيليماتري',
        error: err.message,
      },
      { status: 500 }
    );
  }
}

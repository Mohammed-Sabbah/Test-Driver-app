import { NextRequest, NextResponse } from 'next/server';
import { DriverTelemetryPayload, TelemetryServerResponse } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body: any = await req.json();
    const serverTime = Date.now();

    if (!body) {
      return NextResponse.json(
        { success: false, message: 'حمولة فارغة' },
        { status: 400 }
      );
    }

    // دعم النمطين: الكلاسيكي والـ Micro-Payload المضغوط
    // في النمط المضغوط: c = [lat, lng], s = speed, h = heading, a = accuracy, t = timestamp, v = vehicleId
    const isCompact = Array.isArray(body.c);
    const lat = isCompact ? body.c[0] : body.lat;
    const lng = isCompact ? body.c[1] : body.lng;
    const timestamp = isCompact ? body.t : body.timestamp;
    const clientSeq = isCompact ? body.q : body.clientSeq;
    const vehicleId = isCompact ? body.v : body.vehicleId;

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json(
        { success: false, message: 'إحداثيات غير صالحة' },
        { status: 400 }
      );
    }

    const transitDelayMs = Math.max(0, serverTime - (timestamp || serverTime));

    const responseData: TelemetryServerResponse = {
      success: true,
      clientSeq: clientSeq || 0,
      serverTime,
      transitDelayMs,
      processedCount: 1,
      message: `تم استقبال نبضة المركبة ${vehicleId} بنجاح (${isCompact ? 'Micro-Payload' : 'Standard'} - تأخير: ${transitDelayMs}ms)`,
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

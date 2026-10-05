import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action || 'accept'; // 'accept' | 'finish'
    const now = Date.now();

    // محاكاة معالجة المهمة
    return NextResponse.json({
      success: true,
      action,
      taskId: body.taskId || 'DEMO-TASK-001',
      serverTime: now,
      message: action === 'finish'
        ? `🏁 تم تسليم وإنهاء المهمة بنجاح (عداد النهاية: ${body.endOdometer || 1250} كم)`
        : '🚀 تم بدء المهمة الميدانية وتفعيل تتبع الرحلة بنجاح',
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

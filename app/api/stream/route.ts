import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  let intervalId: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      let tick = 0;
      // Send initial connect frame
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected', time: Date.now() })}\n\n`)
      );

      // Heartbeat pulse every 2 seconds
      intervalId = setInterval(() => {
        tick++;
        try {
          const payload = JSON.stringify({
            type: 'heartbeat',
            tick,
            serverTime: Date.now(),
          });
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch {
          if (intervalId) clearInterval(intervalId);
        }
      }, 2000);
    },
    cancel() {
      if (intervalId) clearInterval(intervalId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

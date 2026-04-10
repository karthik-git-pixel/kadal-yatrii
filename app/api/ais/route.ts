import { NextResponse } from 'next/server';
import WebSocket from 'ws';

// This API route acts as a secure proxy for the AISStream.io WebSocket.
// It hides the AISSTREAM_API_KEY from the client and streams data via Server-Sent Events (SSE).

export const dynamic = 'force-dynamic';

export async function GET() {
  const apiKey = process.env.AISSTREAM_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: 'AISSTREAM_API_KEY is not configured on the server' }, { status: 500 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      console.log("Proxy: Connecting to AISStream...");
      const aisSocket = new WebSocket("wss://stream.aisstream.io/v0/stream");

      aisSocket.on('open', () => {
        const subscriptionMessage = {
          APIKey: apiKey,
          BoundingBoxes: [[[5.0, 70.0], [15.0, 80.0]]],
          FilterMessageTypes: ["PositionReport"]
        };
        aisSocket.send(JSON.stringify(subscriptionMessage));
      });

      aisSocket.on('message', (data) => {
        try {
          // Wrap the AIS message in SSE format
          const message = `data: ${data.toString()}\n\n`;
          controller.enqueue(encoder.encode(message));
        } catch (err) {
          console.error("Proxy message error:", err);
        }
      });

      aisSocket.on('error', (err) => {
        console.error("Proxy AIS socket error:", err);
        controller.error(err);
      });

      aisSocket.on('close', () => {
        console.log("Proxy AIS socket closed");
        controller.close();
      });

      // Cleanup when client disconnects
      return () => {
        if (aisSocket.readyState === WebSocket.OPEN) {
          aisSocket.close();
        }
      };
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

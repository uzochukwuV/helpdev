// app/api/ocr/route.ts
import { NextResponse } from 'next/server';
import { WebSocketServer } from 'ws';
import { pipe } from '@screenpipe/browser'; // Replace with actual OCR import
import { AIHelper } from '@/lib/ai/ai';

const aihelper = new AIHelper({apiKey:""})

export async function GET() {
    const headers = new Headers();
    headers.set('Connection', 'Upgrade');
    headers.set('Upgrade', 'websocket');
    return new Response('Upgrade Required', { status: 426, headers });
  }

// export async function GET() {
//   if (typeof WebSocketServer === 'undefined') {
//     return NextResponse.json(
//       { error: 'WebSocket not supported in this environment' },
//       { status: 500 }
//     );
//   }

//   const wss = new WebSocketServer({ noServer: true });

//   // This will be called when the client connects
//   const response = NextResponse.json(
//     { message: 'WebSocket connection established' },
//     { status: 200 }
//   );

//   // @ts-ignore - Needed for WebSocket upgrade
//   response.socket.server.on('upgrade', (req, socket, head) => {
//     wss.handleUpgrade(req, socket, head, (ws) => {
//       wss.emit('connection', ws, req);
//     });
//   });

//   // Start OCR monitoring when first client connects
//   wss.on('connection', (ws) => {
//     const ocrMonitor = monitorScreenActivity(ws);
    
//     ws.on('close', () => {
//     //   ocrMonitor.stop(); // Implement cleanup in your monitor
//     });
//   });

//   return response;
// }

async function monitorScreenActivity(ws: WebSocket) {
  // Monitor screen content in real-time
  for await (const event of pipe.streamVision(true)) {
    const appName = event.data.app_name?.toLowerCase() || "";
    const text = event.data.text?.toLowerCase() || "";
    const timestamp = new Date().toISOString();

    // Process with AI helper
    const aiResults = await aihelper.processCodeContent(text, {
      sourceApp: appName,
    });

    // Send to connected clients
    ws.send(JSON.stringify({
      type: 'ocr_update',
      data: {
        appName,
        text: text.substring(0, 100), // Preview
        timestamp,
        suggestions: aiResults.suggestions,
        errors: aiResults.errors
      }
    }));

    // You could also store in database here
  }
}


export function SOCKET(
    client: import("ws").WebSocket,
    request: import("http").IncomingMessage,
    server: import("ws").WebSocketServer
  ) {
    console.log("A client connected");
  
    client.on("message", (message) => {
      console.log("Received message:", message);
      client.send(message);
    });

    // client.on("connection", (stream)=>{
    //     const ocrMonitor = monitorScreenActivity(client);
    // })
  
    client.on("close", () => {
      console.log("A client disconnected");
    });
    
  }
// "use client";


// import { Inter } from "next/font/google";

// import { useEffect, useState } from "react";

// const inter = Inter({ 
//   subsets: ['latin'],
//   display: 'swap',
//   variable: '--font-inter',
// });


// // entry page
// export default function Page() {
//   useEffect(() => {
    
//   }, []);

//   return (
//     <div>


//     </div>

//   );
// }
// components/ActivityMonitor.tsx
'use client';


import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface OCREvent {
  type: string;
  data: {
    appName: string;
    text: string;
    timestamp: string;
    suggestions: string[];
    errors?: Array<{ error: string; solution: string }>;
  };
}

export default function ActivityMonitor() {
  const [events, setEvents] = useState<OCREvent['data'][]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Connect to WebSocket
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ocr`);

    ws.onopen = () => {
      setIsConnected(true);
      toast.success('Screen monitoring active');
    };

    const controller = new AbortController();

    ws.addEventListener(
      'message',
      async (event) => {
        console.log('Incoming event:', event);        
      },
      controller,
    );

    ws.onmessage = (event) => {
      const data: OCREvent = JSON.parse(event.data);
      setEvents(prev => [data.data, ...prev].slice(0, 50)); // Keep last 50 events

      // Show notifications for important events
      if (data.data.errors?.length) {
        data.data.errors.forEach(err => {
          toast.error(`Error detected: ${err.error}`, {
            action: {
              label: 'Fix',
              onClick: () => applyFix(err.solution)
            }
          });
        });
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      toast.warning('Screen monitoring disconnected');
    };

    return () => ws.close();
  }, []);

  const applyFix = (solution: string) => {
    // Implement fix application logic
    console.log('Applying fix:', solution);
  };

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-background border rounded-lg shadow-lg z-50">
      <div className="p-4 border-b">
        <h3 className="font-bold">Screen Activity Monitor</h3>
        <div className="text-sm text-muted-foreground">
          Status: {isConnected ? 'Connected' : 'Disconnected'}
        </div>
      </div>
      
      <div className="max-h-96 overflow-y-auto">
        {events.map((event, i) => (
          <div key={i} className="p-4 border-b">
            <div className="flex justify-between text-sm">
              <span className="font-medium">{event.appName}</span>
              <span className="text-muted-foreground">
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <p className="text-sm mt-1 line-clamp-2">{event.text}</p>
            
            {event.suggestions?.length > 0 && (
              <div className="mt-2">
                <h4 className="text-xs font-semibold text-muted-foreground">Suggestions</h4>
                <ul className="text-sm space-y-1 mt-1">
                  {event.suggestions.map((suggestion, j) => (
                    <li key={j}>• {suggestion}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
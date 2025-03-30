'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function useMessaging(url: () => string) {
  const ref = useRef<WebSocket>();
  const target = useRef(url);

  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (ref.current) return;
    const socket = new WebSocket(target.current());
    ref.current = socket;

    const controller = new AbortController();

    socket.addEventListener(
      'message',
      async (event) => {
        console.log('Incoming event:', event);
        const payload =
          typeof event.data === 'string' ? event.data : await event.data.text();
        const message = JSON.parse(payload);
        console.log('Incoming message:', message);
        // setMessages((p:any) => [...p, {...message}]);
      },
      controller,
    );

    socket.addEventListener(
      'error',
      () => {
        const content = 'An error occurred while connecting to the server';
        setMessages((p) => [...p]);
      },
      controller,
    );

    socket.addEventListener(
      'close',
      (event) => {
        if (event.wasClean) return;
        const content = 'The connection to the server was closed unexpectedly';
        setMessages((p) => [...p]);
      },
      controller,
    );

    return () => controller.abort();
  }, []);

  const sendMessage = useCallback((message: any) => {
    if (!ref.current || ref.current.readyState !== ref.current.OPEN) return;
    console.log('Outgoing message:', message);
    ref.current.send(JSON.stringify(message));
    setMessages((p) => [...p, { ...message }]);
  }, []);

  return [messages, sendMessage] as const;
}
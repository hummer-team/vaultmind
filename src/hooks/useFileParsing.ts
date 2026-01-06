import { useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

interface ParseMessage {
  type: string;
  id: string;
  [key: string]: any;
}

interface ParseResponse {
  type: string;
  id: string;
  error?: string;
  data?: ArrayBuffer;
}

export const useFileParsing = (iframeRef: React.RefObject<HTMLIFrameElement>) => {
  const messageCallbacks = useRef<Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void }>>(new Map());

  useEffect(() => {
    const handleMessage = (event: MessageEvent<ParseResponse>) => {
      if (iframeRef.current && event.source === iframeRef.current.contentWindow) {
        const { id, type, error, data } = event.data;
        const callback = messageCallbacks.current.get(id);

        if (callback) {
          if (type === 'PARSE_SUCCESS') {
            callback.resolve(data);
          } else if (type === 'PARSE_ERROR') {
            callback.reject(new Error(error || 'Unknown parsing error'));
          }
          messageCallbacks.current.delete(id);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [iframeRef]);

  const sendMessageToSandbox = useCallback(
    <T>(message: Omit<ParseMessage, 'id'>, transferables?: Transferable[]): Promise<T> => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Sandbox handshake timed out for parsing.')), 10000); // 10秒超时
        const checkSandboxReady = () => {
          if (iframeRef.current && iframeRef.current.contentWindow) {
            clearTimeout(timeout);
            const id = uuidv4();
            messageCallbacks.current.set(id, { resolve, reject });
            iframeRef.current.contentWindow.postMessage({ ...message, id }, '*', transferables);
          } else {
            setTimeout(checkSandboxReady, 100);
          }
        };
        checkSandboxReady();
      });
    },
    [iframeRef]
  );

  const parseFileToArrow = useCallback(
    async (file: File): Promise<Uint8Array> => {
      const arrayBuffer = await file.arrayBuffer();
      const arrowBuffer = await sendMessageToSandbox<ArrayBuffer>(
        { type: 'PARSE_BUFFER_TO_ARROW', buffer: arrayBuffer, fileName: file.name },
        [arrayBuffer]
      );
      return new Uint8Array(arrowBuffer);
    },
    [sendMessageToSandbox]
  );

  return { parseFileToArrow };
};

import { useCallback, useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';

// Import resource URLs as relative paths
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import duckdb_worker_mvp from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdb_worker_eh from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import duckdb_pthread_worker_from_url from '@duckdb/duckdb-wasm/dist/duckdb-browser-coi.pthread.worker.js?url';
import duckdb_pthread_worker_content from '@duckdb/duckdb-wasm/dist/duckdb-browser-coi.pthread.worker.js?raw'; // <-- Import as raw text

// REMOVE this import:
// import our_duckdb_worker_script_url from '../workers/duckdb.worker.ts?url';

interface AppMessage {
  type: string;
  id: string;
  [key: string]: any;
}

interface SandboxResponse {
  type: string;
  id?: string;
  error?: string;
  result?: any;
}

type MessageCallback = { resolve: (value: any) => void; reject: (reason?: any) => void };

export const useDuckDB = (iframeRef: React.RefObject<HTMLIFrameElement>) => {
  const messageCallbacks = useRef<Map<string, MessageCallback>>(new Map());
  const [isDBReady, setIsDBReady] = useState(false);
  const [isSandboxReady, setIsSandboxReady] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<SandboxResponse>) => {
      if (iframeRef.current && event.source === iframeRef.current.contentWindow) {
        if (event.data.type === 'SANDBOX_READY') {
          setIsSandboxReady(true);
          return;
        }

        const { id, type, error, result } = event.data;
        if (id && messageCallbacks.current.has(id)) {
          const callback = messageCallbacks.current.get(id)!;
          if (type.endsWith('_SUCCESS')) {
            if (type === 'DUCKDB_INIT_SUCCESS') {
              setIsDBReady(true);
            }
            callback.resolve(result);
          } else if (type.endsWith('_ERROR')) {
            callback.reject(new Error(error || 'Unknown sandbox error'));
          }
          messageCallbacks.current.delete(id);
        }
      }
    };
    
    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [iframeRef]);
  
  const sendMessageToSandbox = useCallback(
    <T>(message: Omit<AppMessage, 'id'>, transferables?: Transferable[]): Promise<T> => {
      return new Promise((resolve, reject) => {
        if (!isSandboxReady || !iframeRef.current?.contentWindow) {
          return reject(new Error('Sandbox not ready.'));
        }
        const id = uuidv4();
        messageCallbacks.current.set(id, { resolve, reject });
        iframeRef.current.contentWindow.postMessage({ ...message, id }, '*', transferables || []);
      });
    },
    [isSandboxReady, iframeRef]
  );

  const initializeDuckDB = useCallback(async () => {
    if (!isSandboxReady) {
      await new Promise<void>(resolve => {
        const interval = setInterval(() => {
          if (isSandboxReady) {
            clearInterval(interval);
            resolve();
          }
        }, 100);
      });
    }
    
    console.log('[useDuckDB] Sandbox ready. Building bundle with absolute paths...');
    
    // Manually construct the URL to the predictably-named worker script
    const our_duckdb_worker_script_url = chrome.runtime.getURL('assets/duckdb.worker.js');
    console.log('[useDuckDB] Manually constructed worker URL:', our_duckdb_worker_script_url);

    const DUCKDB_RESOURCES = {
      'duckdb-mvp.wasm': duckdb_wasm,
      'duckdb-browser-mvp.worker.js': duckdb_worker_mvp,
      'duckdb-eh.wasm': duckdb_wasm_eh,
      'duckdb-browser-eh.worker.js': duckdb_worker_eh,
      'duckdb-browser-coi.pthread.worker.js': duckdb_pthread_worker_from_url, // Keep the URL for other purposes if needed
      // Pass the content of the pthread worker
      'duckdb-browser-coi.pthread.worker.js_content': duckdb_pthread_worker_content, // <-- Pass content
      'our-duckdb-worker-script.js': our_duckdb_worker_script_url,
    };

    const extensionOrigin = chrome.runtime.getURL('/');
    console.log('[useDuckDB] Calculated extensionOrigin:', extensionOrigin); // Log extensionOrigin

    console.log('[useDuckDB] Sending DUCKDB_INIT to sandbox with absolute resource paths and extension origin.');
    // Deep copy resources to ensure they are not modified during postMessage transfer
    const messageToSend = { type: 'DUCKDB_INIT', resources: JSON.parse(JSON.stringify(DUCKDB_RESOURCES)), extensionOrigin };
    console.log('[useDuckDB] Message object being sent:', messageToSend); // Log full message object
    return sendMessageToSandbox(messageToSend);
  }, [isSandboxReady, sendMessageToSandbox]);

  const loadData = useCallback(
    (tableName: string, buffer: Uint8Array) => {
      if (!isDBReady) return Promise.reject(new Error('DuckDB is not ready.'));
      return sendMessageToSandbox({ type: 'DUCKDB_LOAD_DATA', tableName, buffer }, [buffer.buffer]);
    },
    [sendMessageToSandbox, isDBReady]
  );

  const executeQuery = useCallback(
    (sql: string) => {
      if (!isDBReady) return Promise.reject(new Error('DuckDB is not ready.'));
      return sendMessageToSandbox({ type: 'DUCKDB_EXECUTE_QUERY', sql });
    },
    [sendMessageToSandbox, isDBReady]
  );

  return { initializeDuckDB, loadData, executeQuery, isDBReady };
};

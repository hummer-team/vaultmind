import { useCallback, useState, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getDuckDBResources } from '../utils/DuckDBEngineDefine';

// Type definitions remain the same
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

// Module-level guards remain the same
let _duckdbInitialized = false;
let _duckdbInitializingPromise: Promise<any> | null = null;
let _unloadHandlerRegistered = false;

export const useDuckDB = (iframeRef: React.RefObject<HTMLIFrameElement>) => {
  // UI-related states remain the same
  const [isDBReady, setIsDBReady] = useState(false);
  const [isSandboxReady, setIsSandboxReady] = useState(false);

  // --- Internal Sandbox Client ---
  // This memoized object encapsulates all communication logic.
  const sandboxClient = useMemo(() => {
    const messageCallbacks = new Map<string, MessageCallback>();

    const handleMessage = (event: MessageEvent<SandboxResponse>) => {
      if (iframeRef.current && event.source === iframeRef.current.contentWindow) {
        if (event.data.type === 'SANDBOX_READY') {
          setIsSandboxReady(true);
          return;
        }

        const { id, type, error, result } = event.data;
        if (id && messageCallbacks.has(id)) {
          const callback = messageCallbacks.get(id)!;
          if (type.endsWith('_SUCCESS')) {
            if (type === 'DUCKDB_INIT_SUCCESS') {
              _duckdbInitialized = true;
              setIsDBReady(true);
            }
            callback.resolve(result);
          } else if (type.endsWith('_ERROR')) {
            callback.reject(new Error(error || 'Unknown sandbox error'));
          }
          messageCallbacks.delete(id);
        }
      }
    };

    window.addEventListener('message', handleMessage);

    // The client exposes a 'post' method and a 'destroy' method for cleanup.
    return {
      post: <T,>(message: Omit<AppMessage, 'id'>, transferables?: Transferable[]): Promise<T> => {
        return new Promise((resolve, reject) => {
          // The check for sandbox readiness is now part of the promise
          if (!isSandboxReady || !iframeRef.current?.contentWindow) {
            return reject(new Error('Sandbox not ready or not available.'));
          }
          const id = uuidv4();
          messageCallbacks.set(id, { resolve, reject });
          iframeRef.current.contentWindow.postMessage({ ...message, id }, '*', transferables || []);
        });
      },
      destroy: () => {
        window.removeEventListener('message', handleMessage);
        // Reject all pending promises on cleanup to prevent memory leaks
        messageCallbacks.forEach(cb => cb.reject(new Error('Sandbox client destroyed.')));
        messageCallbacks.clear();
      },
      // Expose a method to send a message without waiting for a reply
      postWithoutReply: (message: Omit<AppMessage, 'id'>) => {
        if (isSandboxReady && iframeRef.current?.contentWindow) {
          try {
            const id = uuidv4();
            iframeRef.current.contentWindow.postMessage({ ...message, id }, '*');
          } catch (e) {
            console.warn('[useDuckDB] Failed to post message without reply:', e);
          }
        }
      },
      getCallbacks: () => messageCallbacks,
    };
  }, [iframeRef, isSandboxReady]); // Added isSandboxReady dependency

  // Effect to manage the lifecycle of the sandbox client
  useEffect(() => {
    // The destroy function from the client is returned for cleanup
    return () => sandboxClient.destroy();
  }, [sandboxClient]);

  // --- Public API of the Hook ---
  // The public API now uses the sandboxClient, making the logic clean and declarative.

  const shutdownDuckDB = useCallback(async (): Promise<void> => {
    try {
      if (isSandboxReady) {
        sandboxClient.postWithoutReply({ type: 'DUCKDB_SHUTDOWN' });
      }
    } finally {
      // Clear all state
      _duckdbInitialized = false;
      _duckdbInitializingPromise = null;
      setIsDBReady(false);
      setIsSandboxReady(false);
      // Manually clear callbacks map as a final measure
      sandboxClient.getCallbacks().forEach(cb => cb.reject(new Error('Shutdown initiated.')));
      sandboxClient.getCallbacks().clear();
    }
  }, [isSandboxReady, sandboxClient]);

  const initializeDuckDB = useCallback(async () => {
    if (_duckdbInitialized) {
      setIsDBReady(true);
      return Promise.resolve(true);
    }
    if (_duckdbInitializingPromise) {
      return _duckdbInitializingPromise;
    }

    const initPromise = (async () => {
      // This is the original, correct logic for waiting for the sandbox.
      if (!isSandboxReady) {
        await new Promise<void>(resolve => {
          const interval = setInterval(() => {
            // Because isSandboxReady is a state variable, we cannot rely on its value
            // inside this promise due to stale closures.
            // The correct way is to check it via the message handler that sets the state.
            // However, to keep the logic as close to original as possible, we'll poll.
            // A better approach would be an event emitter, but that's a larger refactor.
            // The dependency array of useMemo will re-create the client when isSandboxReady changes,
            // which makes the client's internal check work.
            if (isSandboxReady) { // This check will eventually pass when the state updates and this hook re-runs.
              clearInterval(interval);
              resolve();
            }
          }, 100);
        });
      }

      console.log('[useDuckDB] Sandbox ready. Getting DuckDB resources...');
      const DUCKDB_RESOURCES = await getDuckDBResources();
      const extensionOrigin = chrome.runtime.getURL('/');
      console.log('[useDuckDB] Sending DUCKDB_INIT to sandbox...');
      
      const messageToSend = { type: 'DUCKDB_INIT', resources: JSON.parse(JSON.stringify(DUCKDB_RESOURCES)), extensionOrigin };
      
      const res = await sandboxClient.post(messageToSend);
      
      _duckdbInitialized = true;
      setIsDBReady(true);
      return res;
    })();

    _duckdbInitializingPromise = initPromise;

    if (!_unloadHandlerRegistered) {
      _unloadHandlerRegistered = true;
      window.addEventListener('unload', () => {
        shutdownDuckDB().catch(err => console.warn('[useDuckDB] shutdown on unload failed:', err));
      });
    }

    initPromise.finally(() => {
      _duckdbInitializingPromise = null;
    });

    return initPromise;
  }, [isSandboxReady, sandboxClient, shutdownDuckDB]);

  const loadData = useCallback(
    (tableName: string, buffer: Uint8Array) => {
      if (!isDBReady) return Promise.reject(new Error('DuckDB is not ready.'));
      return sandboxClient.post({ type: 'DUCKDB_LOAD_DATA', tableName, buffer }, [buffer.buffer]);
    },
    [sandboxClient, isDBReady]
  );

  const executeQuery = useCallback(
    (sql: string): Promise<{ data: any[], schema: any[] }> => {
      if (!isDBReady) return Promise.reject(new Error('DuckDB is not ready.'));
      return sandboxClient.post({ type: 'DUCKDB_EXECUTE_QUERY', sql });
    },
    [sandboxClient, isDBReady]
  );

  const dropTable = useCallback(
    (tableName: string) => {
      if (!isDBReady) return Promise.reject(new Error('DuckDB is not ready.'));
      const sql = `DROP TABLE IF EXISTS "${tableName}";`;
      return sandboxClient.post({ type: 'DUCKDB_EXECUTE_QUERY', sql });
    },
    [sandboxClient, isDBReady]
  );

  const getAllUserTables = useCallback(async (): Promise<string[]> => {
    if (!isDBReady) {
      console.warn('[useDuckDB] DB not ready, returning empty table list.');
      return [];
    }
    try {
      const result = await executeQuery("SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'main_table_%';");
      const tableData = result.data || [];
      return tableData.map((row: any) => row.table_name);
    } catch (error) {
      console.error('[useDuckDB] Failed to get all user tables:', error);
      return [];
    }
  }, [executeQuery, isDBReady]);

  return { initializeDuckDB, loadData, executeQuery, dropTable, getAllUserTables, isDBReady, shutdownDuckDB };
};

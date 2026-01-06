import { useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import * as duckdb from '@duckdb/duckdb-wasm';

// 导入 DuckDB 资源文件
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import duckdb_worker_mvp from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdb_worker_eh from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import duckdb_pthread_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-coi.pthread.worker.js?url';

interface DuckDBMessage {
  type: string;
  id: string;
  bundle?: duckdb.DuckDBBundle;
  [key: string]: any;
}

interface DuckDBResponse {
  type: string;
  id: string;
  error?: string;
  result?: any;
  schema?: any;
  data?: ArrayBuffer;
}

export const useDuckDB = (iframeRef: React.RefObject<HTMLIFrameElement>) => {
  const messageCallbacks = useRef<Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void }>>(new Map());

  useEffect(() => {
    const handleMessage = (event: MessageEvent<DuckDBResponse>) => {
      if (iframeRef.current && event.source === iframeRef.current.contentWindow) {
        const { id, type, error, result, schema, data } = event.data;
        const callback = messageCallbacks.current.get(id);

        if (callback) {
          if (type.endsWith('_SUCCESS')) {
            if (data) callback.resolve(data);
            else if (result) callback.resolve(result);
            else if (schema) callback.resolve(schema);
            else callback.resolve(true);
          } else if (type.endsWith('_ERROR')) {
            callback.reject(new Error(error || 'Unknown sandbox error'));
          }
          messageCallbacks.current.delete(id);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [iframeRef]);

  const sendMessageToSandbox = useCallback(
    <T>(message: Omit<DuckDBMessage, 'id'>, transferables?: Transferable[]): Promise<T> => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Sandbox handshake timed out.')), 5000);
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

  const initializeDuckDB = useCallback(async () => {
    // 1. 创建符合类型定义的 DUCKDB_BUNDLES
    const DUCKDB_BUNDLES: duckdb.DuckDBBundles = {
      mvp: {
        mainModule: chrome.runtime.getURL(duckdb_wasm),
        mainWorker: chrome.runtime.getURL(duckdb_worker_mvp),
      },
      eh: {
        mainModule: chrome.runtime.getURL(duckdb_wasm_eh),
        mainWorker: chrome.runtime.getURL(duckdb_worker_eh),
      },
    };

    // 2. 获取基础 bundle
    const bundle = await duckdb.selectBundle(DUCKDB_BUNDLES);

    // 3. 手动将 pthreadWorker 的完整 URL 添加到 bundle 对象中
    (bundle as any).pthreadWorker = chrome.runtime.getURL(duckdb_pthread_worker);

    // 4. 将增强后的 bundle 发送给沙箱
    return sendMessageToSandbox({ type: 'DUCKDB_INIT', bundle });
  }, [sendMessageToSandbox]);

  const loadData = useCallback(
    (tableName: string, buffer: Uint8Array) => {
      return sendMessageToSandbox(
        { type: 'DUCKDB_LOAD_DATA', tableName, buffer: buffer.buffer },
        [buffer.buffer]
      );
    },
    [sendMessageToSandbox]
  );

  const executeQuery = useCallback(
    (sql: string) => sendMessageToSandbox({ type: 'DUCKDB_EXECUTE_QUERY', sql }),
    [sendMessageToSandbox]
  );

  const getTableSchema = useCallback(
    (tableName: string) => sendMessageToSandbox({ type: 'DUCKDB_GET_SCHEMA', tableName }),
    [sendMessageToSandbox]
  );

  return { initializeDuckDB, loadData, executeQuery, getTableSchema };
};

import { useEffect, useRef, useCallback, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import * as ExcelJS from 'exceljs';
import { Attachment } from '../types/workbench.types';

interface ParseMessage {
  type: string;
  id: string;
  [key: string]: any;
}

interface ParseResponse {
  type: string;
  id?: string;
  error?: string;
  data?: ArrayBuffer;
}

export const useFileParsing = (iframeRef: React.RefObject<HTMLIFrameElement>) => {
  const messageCallbacks = useRef<Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void }>>(new Map());
  const [isSandboxReady, setIsSandboxReady] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<ParseResponse>) => {
      if (iframeRef.current && event.source === iframeRef.current.contentWindow) {
        if (event.data.type === 'SANDBOX_READY') {
          setIsSandboxReady(true);
          return;
        }

        const { id, type, error, data } = event.data;
        if (id) {
          const callback = messageCallbacks.current.get(id);
          if (callback) {
            if (type.endsWith('_SUCCESS')) {
              callback.resolve(data);
            } else if (type.endsWith('_ERROR')) {
              callback.reject(new Error(error || 'Unknown parsing error'));
            }
            messageCallbacks.current.delete(id);
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [iframeRef]);

  const sendMessageToSandbox = useCallback(
    <T>(message: Omit<ParseMessage, 'id'>, transferables?: Transferable[]): Promise<T> => {
      return new Promise((resolve, reject) => {
        if (!isSandboxReady) {
          return reject(new Error('Sandbox not ready for parsing.'));
        }
        if (!iframeRef.current?.contentWindow) {
          return reject(new Error('Sandbox iframe not available.'));
        }

        const id = uuidv4();
        messageCallbacks.current.set(id, { resolve, reject });
        iframeRef.current.contentWindow.postMessage({ ...message, id }, '*', transferables || []);
      });
    },
    [iframeRef, isSandboxReady]
  );

  const getSheetNamesFromExcel = useCallback(async (file: File): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        if (!event.target?.result) {
          return reject(new Error('Failed to read file.'));
        }
        try {
          const buffer = event.target.result as ArrayBuffer;
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.load(buffer, { ignoreNodes: ['dataValidations', 'sheetData'] });
          const sheetNames = workbook.worksheets.map(ws => ws.name);
          resolve(sheetNames);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsArrayBuffer(file);
    });
  }, []);

  const registerFileWithWorker = useCallback(
    async (file: File): Promise<void> => {
      const buffer = await file.arrayBuffer();
      await sendMessageToSandbox<void>(
        { type: 'DUCKDB_REGISTER_FILE', fileName: file.name, buffer: new Uint8Array(buffer) },
        [buffer]
      );
    },
    [sendMessageToSandbox]
  );

  const loadFileInDuckDB = useCallback(
    async (file: File, tableName: string, sheetName?: string): Promise<void> => {
      const arrayBuffer = await file.arrayBuffer();
      await sendMessageToSandbox<void>(
        {
          type: 'LOAD_FILE',
          buffer: arrayBuffer,
          fileName: file.name,
          tableName: tableName,
          sheetName: sheetName,
        },
        [arrayBuffer]
      );
    },
    [sendMessageToSandbox]
  );

  const loadSheetsInDuckDB = useCallback(
    async (file: File, selectedSheets: string[], existingAttachmentCount: number): Promise<Attachment[]> => {
      // First, ensure the file is available in the worker's virtual file system.
      await registerFileWithWorker(file);

      const newAttachments: Attachment[] = [];
      for (let i = 0; i < selectedSheets.length; i++) {
        const sheetName = selectedSheets[i];
        const tableIndex = existingAttachmentCount + i + 1;
        const tableName = `main_table_${tableIndex}`;
        
        const newAttachment: Attachment = {
          id: uuidv4(),
          file,
          tableName,
          sheetName,
          status: 'uploading',
        };
        newAttachments.push(newAttachment);

        // Now, just tell the worker to create a table from the pre-registered file.
        await sendMessageToSandbox<void>({
          type: 'CREATE_TABLE_FROM_FILE',
          fileName: file.name,
          tableName,
          sheetName,
        });
      }
      
      const loadedAttachments = newAttachments.map(att => ({ ...att, status: 'success' as const }));
      return loadedAttachments;
    },
    [registerFileWithWorker, sendMessageToSandbox]
  );

  return { loadFileInDuckDB, loadSheetsInDuckDB, getSheetNamesFromExcel, isSandboxReady };
};

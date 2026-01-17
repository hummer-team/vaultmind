// Types related to the Workbench component and its state.

export type WorkbenchState =
  | 'initializing'
  | 'waitingForFile'
  | 'parsing'
  | 'selectingSheet' // New state for multi-sheet selection
  | 'fileLoaded'
  | 'analyzing'
  | 'resultsReady'
  | 'error';

export interface Attachment {
  id: string;
  file: File;
  tableName: string;
  sheetName?: string; // Optional: To store the original sheet name for context
  status: 'uploading' | 'success' | 'error';
  error?: string;
}

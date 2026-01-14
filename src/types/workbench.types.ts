// Types related to the Workbench component and its state.

export type WorkbenchState =
  | 'initializing'
  | 'waitingForFile'
  | 'parsing'
  | 'fileLoaded'
  | 'analyzing'
  | 'resultsReady'
  | 'error';

export interface Attachment {
  id: string;
  file: File;
  tableName: string;
  status: 'uploading' | 'success' | 'error';
  error?: string;
}

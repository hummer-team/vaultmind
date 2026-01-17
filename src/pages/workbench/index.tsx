import React, { useState, useEffect, useMemo, useRef } from 'react';
import { theme, Spin, App, Typography, Tag, Space } from 'antd';
import { v4 as uuidv4 } from 'uuid';
import ChatPanel from './components/ChatPanel';
import ResultsDisplay from './components/ResultsDisplay';
import { SheetSelector } from './components/SheetSelector';
import { PromptManager } from '../../services/llm/PromptManager';
import { AgentExecutor } from '../../services/llm/AgentExecutor';
import { LLMConfig } from '../../services/llm/LLMClient';
import Sandbox from '../../components/layout/Sandbox';
import { useDuckDB } from '../../hooks/useDuckDB';
import { useFileParsing } from '../../hooks/useFileParsing';
import { WorkbenchState, Attachment } from '../../types/workbench.types';

// Configuration
const MAX_FILES = import.meta.env.VITE_LLM_PROVIDER as number || 1; // Default to 1, can be increased later

interface AnalysisRecord {
  id: string;
  query: string;
  thinkingSteps: { tool: string; params: any; thought?: string } | null;
  result: any;
  status: 'analyzing' | 'resultsReady';
}

interface WorkbenchProps {
  isFeedbackDrawerOpen: boolean;
  setIsFeedbackDrawerOpen: (isOpen: boolean) => void;
}

const promptManager = new PromptManager();

const tagStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.08)',
  borderColor: 'rgba(255, 255, 255, 0.2)',
  color: 'rgba(255, 255, 255, 0.85)',
  padding: '4px 8px',
  borderRadius: '4px',
  fontSize: '13px',
};

const InitialWelcomeView: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', gap: '16px' }}>
    <img src="/icons/icon-512.png" alt="Vaultmind Logo" style={{ width: 256, height: 256 }} />
    <Typography.Title level={3}>Hi, 我是Vaultmind我能帮您：</Typography.Title>
    <Space size={[8, 16]} wrap>
      <Tag style={tagStyle}>快速准确Excel，CSV数据分析</Tag>
      <Tag style={tagStyle}>图表绘制</Tag>
      <Tag style={tagStyle}>数据洞察</Tag>
      <Tag style={tagStyle}>智能报表生成</Tag>
    </Space>
  </div>
);

const Workbench: React.FC<WorkbenchProps> = ({ setIsFeedbackDrawerOpen }) => {
  const { token: { borderRadiusLG } } = theme.useToken();
  const { message } = App.useApp();
  const abortControllerRef = useRef<AbortController | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { initializeDuckDB, executeQuery, isDBReady, dropTable } = useDuckDB(iframeRef);
  const { loadFileInDuckDB, loadSheetsInDuckDB, getSheetNamesFromExcel, isSandboxReady } = useFileParsing(iframeRef);

  const [uiState, setUiState] = useState<WorkbenchState>('initializing');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [chatError, setChatError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisRecord[]>([]);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  
  // State for multi-sheet handling
  const [sheetsToSelect, setSheetsToSelect] = useState<string[] | null>(null);
  const [fileToLoad, setFileToLoad] = useState<File | null>(null);

  const [llmConfig] = useState<LLMConfig>({
    provider: import.meta.env.VITE_LLM_PROVIDER as any,
    apiKey: import.meta.env.VITE_LLM_API_KEY as string,
    baseURL: import.meta.env.VITE_LLM_API_URL as string,
    modelName: import.meta.env.VITE_LLM_MODEL_NAME as string,
    mockEnabled: import.meta.env.VITE_LLM_MOCK === 'true',
  });

  const agentExecutor = useMemo(() => {
    if (!isDBReady || !executeQuery) return null;
    // Pass the attachments to the executor so it knows the table-to-sheet mapping
    return new AgentExecutor(llmConfig, executeQuery, attachments);
  }, [llmConfig, executeQuery, isDBReady, attachments]);

  useEffect(() => {
    if (isSandboxReady) {
      initializeDuckDB().catch((err) => {
        console.error('DuckDB initialization failed:', err);
        setUiState('error');
      });
    }
  }, [isSandboxReady, initializeDuckDB]);

  useEffect(() => {
    if (isDBReady && isSandboxReady) {
      if (sheetsToSelect) {
        setUiState('selectingSheet');
      } else {
        setUiState(attachments.length > 0 ? 'fileLoaded' : 'waitingForFile');
      }
    } else {
      setUiState('initializing');
    }
  }, [isDBReady, isSandboxReady, attachments.length, sheetsToSelect]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = content;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 20;
      setShowScrollToBottom(scrollHeight > clientHeight && !isAtBottom);
    };

    const observer = new MutationObserver(handleScroll);
    observer.observe(content, { childList: true, subtree: true });

    content.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      observer.disconnect();
      content.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const handleFileUpload = async (file: File) => {
    if (attachments.length >= MAX_FILES) {
      setChatError(`You can only upload a maximum of ${MAX_FILES} file(s).`);
      return false;
    }
    setChatError(null);
    setUiState('parsing');

    try {
      // Check for multiple sheets only for excel files
      const fileExtension = file.name.split('.').pop()?.toLowerCase();
      if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        const sheetNames = await getSheetNamesFromExcel(file);
        if (sheetNames.length > 1) {
          setFileToLoad(file);
          setSheetsToSelect(sheetNames);
          setUiState('selectingSheet');
          return false; // Stop standard flow
        }
      }

      // Standard flow for single-sheet files (or non-excel files)
      const newAttachment: Attachment = {
        id: uuidv4(),
        file,
        tableName: `main_table_${attachments.length + 1}`,
        status: 'uploading',
      };
      setAttachments((prev) => [...prev, newAttachment]);
      
      await loadFileInDuckDB(file, newAttachment.tableName);

      setAttachments((prev) =>
        prev.map((att) => (att.id === newAttachment.id ? { ...att, status: 'success' } : att))
      );
      const loadedSuggestions = promptManager.getSuggestions('ecommerce');
      setSuggestions(loadedSuggestions);
      setUiState('fileLoaded');

    } catch (error: any) {
      console.error(`[Workbench] Error during file upload process:`, error);
      setUiState('error');
      setChatError(`Failed to load file: ${error.message}`);
    }
    return false;
  };

  const handleLoadSheets = async (selectedSheets: string[]) => {
    if (!fileToLoad) return;

    setUiState('parsing');
    setSheetsToSelect(null);

    try {
      const loadedAttachments = await loadSheetsInDuckDB(fileToLoad, selectedSheets, attachments.length);
      setAttachments(prev => [...prev, ...loadedAttachments]);
      
      const loadedSuggestions = promptManager.getSuggestions('ecommerce');
      setSuggestions(loadedSuggestions);
      setUiState('fileLoaded');
    } catch (error: any) {
      console.error(`[Workbench] Error loading sheets:`, error);
      setUiState('error');
      setChatError(`Failed to load sheets: ${error.message}`);
    } finally {
      setFileToLoad(null);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    const attachmentToDelete = attachments.find((att) => att.id === attachmentId);
    if (!attachmentToDelete) return;

    setAttachments((prev) => prev.filter((att) => att.id !== attachmentId));

    if (attachmentToDelete.status === 'success') {
      try {
        await dropTable(attachmentToDelete.tableName);
        console.log(`[Workbench] Dropped table: ${attachmentToDelete.tableName}`);
      } catch (error) {
        console.error(`[Workbench] Failed to drop table ${attachmentToDelete.tableName}:`, error);
      }
    }
  };

  const handleStartAnalysis = async (query: string) => {
    if (!agentExecutor) {
      setChatError('Analysis engine is not ready.');
      return;
    }
    if (attachments.length === 0) {
      setChatError('Please upload a file before starting the analysis.');
      return;
    }
    setChatError(null);

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const newRecordId = `record-${Date.now()}`;
    const newRecord: AnalysisRecord = { id: newRecordId, query, thinkingSteps: null, result: null, status: 'analyzing' };
    setAnalysisHistory((prev) => [...prev, newRecord]);
    setUiState('analyzing');

    try {
      const result = await agentExecutor.execute(query, signal);

      if (result.cancelled) {
        setAnalysisHistory((prev) => prev.filter((rec) => rec.id !== newRecordId));
        setUiState('fileLoaded');
        return;
      }

      setAnalysisHistory((prev) =>
        prev.map((rec) =>
          rec.id === newRecordId ? { ...rec, status: 'resultsReady', thinkingSteps: { tool: result.tool, params: result.params, thought: result.thought }, result: result.result } : rec
        )
      );
    } catch (error: any) {
      console.error('Analysis failed, updating record with error:', error);
      setAnalysisHistory((prev) =>
        prev.map((rec) =>
          rec.id === newRecordId ? { ...rec, status: 'resultsReady', result: { error: error.message } } : rec
        )
      );
    } finally {
      setUiState('fileLoaded');
      abortControllerRef.current = null;
    }
  };

  const handleCancelAnalysis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      console.log('[Workbench] Analysis cancellation requested.');
    }
  };

  const handleUpvote = (query: string) => {
    console.log(`Upvoted query: "${query}". Backend call would be here.`);
    message.success('Thanks for your feedback!');
    return Promise.resolve({ status: 'success' });
  };

  const handleDownvote = (query: string) => {
    console.log(`Downvoted query: "${query}". Opening feedback drawer.`);
    setIsFeedbackDrawerOpen(true);
  };

  const handleRetry = (query: string) => {
    console.log(`Retrying query: "${query}".`);
    handleStartAnalysis(query);
  };

  const handleDeleteRecord = (recordId: string) => {
    setAnalysisHistory((prev) => prev.filter((rec) => rec.id !== recordId));
    message.success('分析记录已删除');
  };

  const handleScrollToBottom = () => {
    contentRef.current?.scrollTo({ top: contentRef.current.scrollHeight, behavior: 'smooth' });
  };

  const getLoadingTip = () => {
    if (uiState === 'initializing') return 'Initializing data engine...';
    if (uiState === 'parsing') return 'Parsing file(s)...';
    return '';
  };

  const isSpinning = uiState === 'initializing' || uiState === 'parsing';

  const renderAnalysisView = () => {
    if (uiState === 'selectingSheet' && sheetsToSelect) {
      return (
        <SheetSelector
          sheets={sheetsToSelect}
          onLoad={handleLoadSheets}
          onCancel={() => {
            setSheetsToSelect(null);
            setFileToLoad(null);
            setUiState('waitingForFile');
          }}
        />
      );
    }

    if (analysisHistory.length === 0 && attachments.length === 0) {
      return <InitialWelcomeView />;
    }

    return (
      <div>
        {analysisHistory.map((record) => (
          <ResultsDisplay
            key={record.id}
            query={record.query}
            status={record.status}
            data={record.result}
            thinkingSteps={record.thinkingSteps}
            onUpvote={handleUpvote}
            onDownvote={handleDownvote}
            onRetry={handleRetry}
            onDelete={() => handleDeleteRecord(record.id)} // Pass delete handler
          />
        ))}
      </div>
    );
  };

  return (
    <>
      <Sandbox ref={iframeRef} />
      <div style={{ background: 'rgba(38, 38, 40, 0.6)', borderRadius: borderRadiusLG, display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', border: '1px solid rgba(255, 255, 255, 0.1)', backdropFilter: 'blur(10px)' }}>
        {isSpinning && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.05)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10 }}>
            <Spin tip={getLoadingTip()} size="large" />
          </div>
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '24px' }}>
          <div ref={contentRef} style={{ flex: 1, overflow: 'auto' }}>
            {renderAnalysisView()}
          </div>
          <div style={{ flexShrink: 0, paddingTop: '12px' }}>
            <ChatPanel
              onSendMessage={handleStartAnalysis}
              isAnalyzing={uiState === 'analyzing'}
              onCancel={handleCancelAnalysis}
              suggestions={suggestions}
              onFileUpload={handleFileUpload}
              attachments={attachments}
              onDeleteAttachment={handleDeleteAttachment}
              error={chatError}
              setError={setChatError}
              showScrollToBottom={showScrollToBottom}
              onScrollToBottom={handleScrollToBottom}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default Workbench;

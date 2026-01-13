import React, { useState, useEffect, useMemo, useRef } from 'react';
import { theme, Spin, App, Typography } from 'antd'; // Added Typography
import { DraggerProps } from 'antd/es/upload/Dragger';
import ChatPanel from './components/ChatPanel';
import ResultsDisplay from './components/ResultsDisplay';
import { PromptManager } from '../../services/llm/PromptManager';
import { AgentExecutor } from '../../services/llm/AgentExecutor';
import { LLMConfig } from '../../services/llm/LLMClient';
import Sandbox from '../../components/layout/Sandbox';
import { useDuckDB } from '../../hooks/useDuckDB';
import { useFileParsing } from '../../hooks/useFileParsing';
import { WorkbenchState } from '../../types/workbench.types';

interface AnalysisRecord {
  id: string;
  query: string;
  thinkingSteps: { tool: string; params: any, thought?: string } | null;
  result: any;
  status: 'analyzing' | 'resultsReady';
}

interface WorkbenchProps {
  isFeedbackDrawerOpen: boolean;
  setIsFeedbackDrawerOpen: (isOpen: boolean) => void;
}

const promptManager = new PromptManager();

// Step 1: Create the InitialWelcomeView component
const InitialWelcomeView: React.FC = () => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    gap: '16px'
  }}>
    <img src="/icons/icon-512.png" alt="Vaultmind Logo" style={{ width: 256, height: 256 }} />
    <Typography.Title level={3}>Hi, 我是 Vaultmind</Typography.Title>
    <Typography.Text type="secondary">我是您的Excel数据分析助手，很乐意为您服务！</Typography.Text>
  </div>
);

const Workbench: React.FC<WorkbenchProps> = ({ setIsFeedbackDrawerOpen }) => {
  const { token: { borderRadiusLG } } = theme.useToken();
  const { message } = App.useApp();

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { initializeDuckDB, executeQuery, isDBReady } = useDuckDB(iframeRef);
  const { loadFileInDuckDB, isSandboxReady } = useFileParsing(iframeRef);

  const [uiState, setUiState] = useState<WorkbenchState>('initializing');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisRecord[]>([]);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const [llmConfig] = useState<LLMConfig>({
    provider: import.meta.env.VITE_LLM_PROVIDER as any,
    apiKey: import.meta.env.VITE_LLM_API_KEY as string,
    baseURL: import.meta.env.VITE_LLM_API_URL as string,
    modelName: import.meta.env.VITE_LLM_MODEL_NAME as string,
    mockEnabled: import.meta.env.VITE_LLM_MOCK === 'true',
  });
  
  const agentExecutor = useMemo(() => {
    if (!isDBReady || !executeQuery) return null;
    return new AgentExecutor(llmConfig, executeQuery);
  }, [llmConfig, executeQuery, isDBReady]);

  useEffect(() => {
    if (isSandboxReady) {
      initializeDuckDB().catch(err => {
        console.error("DuckDB initialization failed:", err);
        message.error("Failed to initialize data engine.");
      });
    }
  }, [isSandboxReady, initializeDuckDB]);

  useEffect(() => {
    if (isDBReady && isSandboxReady) {
      setUiState('fileLoaded'); 
    } else {
      setUiState('initializing');
    }
  }, [isDBReady, isSandboxReady]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = content;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 20;
      console.log(`[ScrollCheck] scrollHeight: ${scrollHeight}, clientHeight: ${clientHeight}, scrollTop: ${scrollTop}, isAtBottom: ${isAtBottom}`);
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

  const handleFileUpload: DraggerProps['beforeUpload'] = async (file) => {
    setUiState('parsing');
    setAnalysisHistory([]);

    try {
      console.log(`[Workbench] Calling loadFileInDuckDB for file: ${file.name}`);
      await loadFileInDuckDB(file, 'main_table');
      console.log(`[Workbench] loadFileInDuckDB completed for file: ${file.name}`);
      const loadedSuggestions = promptManager.getSuggestions('ecommerce');
      setSuggestions(loadedSuggestions);
      message.success(`${file.name} loaded and ready for analysis.`);
      setUiState('fileLoaded');
    } catch (error: any) {
      console.error(`[Workbench] Error during file upload process:`, error);
      message.error(`Failed to process file: ${error.message}`);
      setUiState('fileLoaded'); 
    }
    return false;
  };

  const handleStartAnalysis = async (query: string) => {
    if (!agentExecutor) {
      message.error('Analysis engine is not ready.');
      return;
    }
    const newRecordId = `record-${Date.now()}`;
    const newRecord: AnalysisRecord = {
      id: newRecordId,
      query: query,
      thinkingSteps: null,
      result: null,
      status: 'analyzing',
    };
    setAnalysisHistory(prev => [...prev, newRecord]);
    setUiState('analyzing');
    try {
      const { tool, params, result, thought } = await agentExecutor.execute(query);
      setAnalysisHistory(prev => prev.map(rec => 
        rec.id === newRecordId 
          ? { ...rec, status: 'resultsReady', thinkingSteps: { tool, params, thought }, result } 
          : rec
      ));
    } catch (error: any) {
      console.error("Analysis failed, updating record with error:", error);
      setAnalysisHistory(prev => prev.map(rec => 
        rec.id === newRecordId 
          ? { ...rec, status: 'resultsReady', result: { error: error.message } } 
          : rec
      ));
    } finally {
      setUiState('fileLoaded');
    }
  };

  const handleScrollToBottom = () => {
    const content = contentRef.current;
    if (content) {
      content.scrollTo({ top: content.scrollHeight, behavior: 'smooth' });
    }
  };

  const handleUpvote = (query: string) => {
    console.log(`Upvoted query: "${query}". Backend call would be here.`);
    // Mock backend call
    return Promise.resolve({ status: 'success' });
  };

  const handleDownvote = (query: string) => {
    console.log(`Downvoted query: "${query}". Opening feedback drawer.`);
    setIsFeedbackDrawerOpen(true); // Use the passed function
  };

  const handleRetry = (query: string) => {
    console.log(`Retrying query: "${query}".`);
    handleStartAnalysis(query);
  };

  const getLoadingTip = () => {
    if (uiState === 'initializing') return '正在初始化数据引擎...';
    if (uiState === 'parsing') return '正在解析文件...';
    return '';
  };

  const isSpinning = uiState === 'initializing' || uiState === 'parsing';

  // Step 2: Add conditional rendering to renderAnalysisView
  const renderAnalysisView = () => {
    if (analysisHistory.length === 0) {
      return <InitialWelcomeView />;
    }
    
    return (
      <div>
        {analysisHistory.map(record => (
          <ResultsDisplay
            key={record.id}
            query={record.query}
            status={record.status}
            data={record.result}
            thinkingSteps={record.thinkingSteps}
            onUpvote={handleUpvote}
            onDownvote={handleDownvote}
            onRetry={handleRetry}
          />
        ))}
      </div>
    );
  };

  return (
    <>
      <Sandbox ref={iframeRef} />
      <div style={{ 
        background: 'rgba(38, 38, 40, 0.6)', 
        borderRadius: borderRadiusLG, 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100%',
        position: 'relative',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
      }}>
        
        {isSpinning && (
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0, 0, 0, 0.05)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10
          }}>
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
              suggestions={suggestions} 
              onFileUpload={handleFileUpload}
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

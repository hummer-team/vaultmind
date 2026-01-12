import React, { useState, useEffect, useMemo, useRef } from 'react';
import { theme, Spin, App } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import Dragger, { DraggerProps } from 'antd/es/upload/Dragger';
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

const promptManager = new PromptManager();

const Workbench: React.FC = () => {
  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();
  const { message } = App.useApp();

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { initializeDuckDB, executeQuery, isDBReady } = useDuckDB(iframeRef);
  const { loadFileInDuckDB, isSandboxReady } = useFileParsing(iframeRef);
  const resultsEndRef = useRef<HTMLDivElement>(null);

  const [uiState, setUiState] = useState<WorkbenchState>('initializing');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisRecord[]>([]);

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

  const scrollToBottom = () => {
    resultsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    setTimeout(scrollToBottom, 100);
  }, [analysisHistory]);

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
      setUiState('waitingForFile');
    } else {
      setUiState('initializing');
    }
  }, [isDBReady, isSandboxReady]);

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
      setUiState('waitingForFile');
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

  const getLoadingTip = () => {
    if (uiState === 'initializing') return '正在初始化数据引擎...';
    if (uiState === 'parsing') return '正在解析文件...';
    return '';
  };

  const isSpinning = uiState === 'initializing' || uiState === 'parsing';

  const renderInitialView = () => (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '24px'
    }}>
      <Dragger 
        {...{ name: "file", multiple: false, beforeUpload: handleFileUpload, showUploadList: false, accept: ".csv,.xls,.xlsx" }} 
        disabled={isSpinning}
        style={{ padding: '48px', maxWidth: 500 }}
      >
        <p className="ant-upload-drag-icon"><InboxOutlined /></p>
        <p className="ant-upload-text">点击或拖拽文件到此区域以上传</p>
        <p className="ant-upload-hint">支持 Excel 和 CSV 格式，文件上限 1GB。</p>
      </Dragger>
    </div>
  );

  const renderAnalysisView = () => (
    <div>
      {analysisHistory.map(record => (
        <ResultsDisplay
          key={record.id}
          query={record.query}
          status={record.status}
          data={record.result}
          thinkingSteps={record.thinkingSteps}
        />
      ))}
      <div ref={resultsEndRef} />
    </div>
  );

  return (
    <>
      <Sandbox ref={iframeRef} />
      <div style={{ background: colorBgContainer, borderRadius: borderRadiusLG, display: 'flex', flexDirection: 'column', flex: 1 }}>
        <Spin spinning={isSpinning} tip={getLoadingTip()} size="large" style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          
          {uiState === 'waitingForFile' && renderInitialView()}
          
          {uiState !== 'waitingForFile' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '24px' }}>
              <div style={{ flex: 1, overflow: 'auto' }}>
                {renderAnalysisView()}
              </div>
              {(uiState === 'fileLoaded' || uiState === 'analyzing') && (
                <div style={{ flexShrink: 0, paddingTop: '12px' }}>
                  <ChatPanel onSendMessage={handleStartAnalysis} isAnalyzing={uiState === 'analyzing'} suggestions={suggestions} />
                </div>
              )}
            </div>
          )}
        </Spin>
      </div>
    </>
  );
};

export default Workbench;

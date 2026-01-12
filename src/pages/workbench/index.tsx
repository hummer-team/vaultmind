import React, { useState, useEffect, useMemo, useRef } from 'react';
import { theme, Typography, Divider, Spin, App } from 'antd';
import AppLayout from '../../components/layout/AppLayout';
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

const { Title, Paragraph } = Typography;

const promptManager = new PromptManager();

const WorkbenchContent: React.FC = () => {
  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();
  const { message } = App.useApp();

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { initializeDuckDB, executeQuery, isDBReady } = useDuckDB(iframeRef);
  const { loadFileInDuckDB, isSandboxReady } = useFileParsing(iframeRef);

  const [uiState, setUiState] = useState<WorkbenchState>('initializing');
  const [fileName, setFileName] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [thinkingSteps, setThinkingSteps] = useState<any>(null);

  const [llmConfig] = useState<LLMConfig>({
    provider: import.meta.env.VITE_LLM_PROVIDER as any,
    apiKey: import.meta.env.VITE_LLM_API_KEY as string,
    baseURL: import.meta.env.VITE_LLM_API_URL as string,
    modelName: import.meta.env.VITE_LLM_MODEL_NAME as string,
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
      setUiState('waitingForFile');
    } else {
      setUiState('initializing');
    }
  }, [isDBReady, isSandboxReady]);

  const handleFileUpload: DraggerProps['beforeUpload'] = async (file) => {
    setUiState('parsing');
    setFileName(file.name);

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
    setUiState('analyzing');
    setAnalysisResult(null);
    setThinkingSteps(null);
    try {
      const { tool, params, result, thought } = await agentExecutor.execute(query);
      setThinkingSteps({ tool, params, thought });
      setAnalysisResult(result);
      setUiState('resultsReady');
    } catch (error: any) {
      message.error(`Analysis failed: ${error.message}`);
      setUiState('fileLoaded');
    }
  };

  const getLoadingTip = () => {
    if (uiState === 'initializing') return '正在初始化数据引擎...';
    if (uiState === 'parsing') return '正在解析文件...';
    if (uiState === 'analyzing') return 'AI 正在分析中...';
    return '';
  };

  const isSpinning = uiState === 'initializing' || uiState === 'parsing' || uiState === 'analyzing';

  const renderInitialView = () => (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
      <Dragger 
        {...{ name: "file", multiple: false, beforeUpload: handleFileUpload, showUploadList: false, accept: ".csv,.xls,.xlsx" }} 
        disabled={uiState !== 'waitingForFile'}
        style={{ padding: '48px', maxWidth: 500 }}
      >
        <p className="ant-upload-drag-icon"><InboxOutlined /></p>
        <p className="ant-upload-text">点击或拖拽文件到此区域以上传</p>
        <p className="ant-upload-hint">支持 Excel 和 CSV 格式，文件上限 1GB。</p>
      </Dragger>
    </div>
  );

  const renderAnalysisView = () => (
    // The padding is now controlled by the parent container for alignment
    <div style={{ height: '100%', overflow: 'auto' }}>
      <ResultsDisplay state={uiState} fileName={fileName} data={analysisResult} thinkingSteps={thinkingSteps} />
    </div>
  );

  return (
    <AppLayout>
      <Sandbox ref={iframeRef} />
      {/* --- CRITICAL CHANGE: Remove fixed height, let Flexbox control the layout --- */}
      <div style={{ padding: 24, background: colorBgContainer, borderRadius: borderRadiusLG, display: 'flex', flexDirection: 'column', flex: 1 }}>
        <Spin spinning={isSpinning} tip={getLoadingTip()} size="large" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Title level={2} style={{ margin: 0 }}>智能数据工作台</Title>
          </div>
          
          <Paragraph>
            {uiState === 'initializing'
              ? '引擎初始化中...'
              : (uiState === 'waitingForFile'
                ? '欢迎来到 Vaultmind。请上传您的数据文件，然后通过对话开始您的分析之旅。'
                : <>当前分析文件: <strong>{fileName}</strong></>)
            }
          </Paragraph>
          <Divider />

          {/* This inner container correctly manages scrolling and docking */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flex: 1, overflow: 'auto', padding: '0 12px' }}>
              {uiState === 'fileLoaded' || uiState === 'analyzing' || uiState === 'resultsReady'
                ? renderAnalysisView()
                : renderInitialView()
              }
            </div>
            
            {(uiState === 'fileLoaded' || uiState === 'analyzing' || uiState === 'resultsReady') && (
              <div style={{ flexShrink: 0, padding: '12px 12px 0 12px' }}>
                <ChatPanel onSendMessage={handleStartAnalysis} isAnalyzing={uiState === 'analyzing'} suggestions={suggestions} />
              </div>
            )}
          </div>
        </Spin>
      </div>
    </AppLayout>
  );
};

const Workbench: React.FC = () => (<App><WorkbenchContent /></App>);

export default Workbench;

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Breadcrumb, Layout, theme, Typography, Divider, Spin, Upload, App } from 'antd';
import AppLayout from '../../components/layout/AppLayout';
import { InboxOutlined } from '@ant-design/icons';
import Dragger, { DraggerProps } from 'antd/es/upload/Dragger';
import ChatPanel from './components/ChatPanel';
import ResultsDisplay from './components/ResultsDisplay';
// import { FileParsingService } from '../../services/FileParsingService'; // 移除旧服务
import { PromptManager } from '../../services/llm/PromptManager';
import { AgentExecutor } from '../../services/llm/AgentExecutor';
import { LLMConfig } from '../../services/llm/LLMClient';
import Sandbox from '../../components/layout/Sandbox';
import { useDuckDB } from '../../hooks/useDuckDB';
import { useFileParsing } from '../../hooks/useFileParsing'; // 引入新 Hook

const { Content } = Layout;
const { Title, Paragraph } = Typography;

// const parsingService = FileParsingService.getInstance(); // 移除旧实例
const promptManager = new PromptManager();

type WorkbenchState = 'waitingForFile' | 'parsing' | 'fileLoaded' | 'analyzing' | 'resultsReady';

const WorkbenchContent: React.FC = () => {
  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();
  const { message } = App.useApp();

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { initializeDuckDB, loadData } = useDuckDB(iframeRef);
  const { parseFileToArrow } = useFileParsing(iframeRef); // 使用新 Hook

  const [state, setState] = useState<WorkbenchState>('waitingForFile');
  const [fileName, setFileName] = useState<string | null>(null);
  const [userRole] = useState('ecommerce');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [thinkingSteps, setThinkingSteps] = useState<any>(null);

  const [llmConfig] = useState<LLMConfig>({
    apiKey: 'YOUR_QWEN_API_KEY',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    modelName: 'qwen-turbo',
  });
  
  const agentExecutor = useMemo(() => new AgentExecutor(llmConfig), [llmConfig]);

  useEffect(() => {
    initializeDuckDB().catch(err => {
      console.error("DuckDB initialization failed:", err);
      message.error("Failed to initialize data engine.");
    });
  }, [initializeDuckDB]);

  const handleFileUpload: DraggerProps['beforeUpload'] = async (file) => {
    const allowedTypes = ['.csv', '.xls', '.xlsx'];
    const fileExtension = `.${file.name.split('.').pop()?.toLowerCase()}`;
    if (!allowedTypes.includes(fileExtension)) {
      message.error('Unsupported file type.');
      return Upload.LIST_IGNORE;
    }
    const isLt1G = file.size / 1024 / 1024 / 1024 < 1;
    if (!isLt1G) {
      message.error('File must be smaller than 1GB!');
      return Upload.LIST_IGNORE;
    }

    setState('parsing');
    setFileName(file.name);

    try {
      // 关键修改：使用新的 parseFileToArrow 函数
      const arrowBuffer = await parseFileToArrow(file);
      await loadData('main_table', arrowBuffer);
      
      const loadedSuggestions = await promptManager.getSuggestions(userRole);
      setSuggestions(loadedSuggestions);

      message.success(`${file.name} loaded and ready for analysis.`);
      setState('fileLoaded');
    } catch (error: any) {
      message.error(`Failed to process file: ${error.message}`);
      setState('waitingForFile');
    }
    return false;
  };

  const handleStartAnalysis = async (query: string) => {
    setState('analyzing');
    setAnalysisResult(null);
    setThinkingSteps(null);
    try {
      const { tool, params, result } = await agentExecutor.execute(query);
      setThinkingSteps({ tool, params });
      setAnalysisResult(result);
      setState('resultsReady');
    } catch (error: any) {
      message.error(`Analysis failed: ${error.message}`);
      setState('fileLoaded');
    }
  };

  const renderInitialView = () => (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
      <Dragger {...{ name: "file", multiple: false, beforeUpload: handleFileUpload, showUploadList: false, accept: ".csv,.xls,.xlsx" }} style={{ padding: '48px', maxWidth: 500 }}>
        <p className="ant-upload-drag-icon"><InboxOutlined /></p>
        <p className="ant-upload-text">点击或拖拽文件到此区域以上传</p>
        <p className="ant-upload-hint">支持 Excel 和 CSV 格式，文件上限 1GB。</p>
      </Dragger>
    </div>
  );

  // --- 问题二：修复 UI 布局问题 ---
  const renderAnalysisView = () => (
    <Layout style={{ background: 'transparent', height: 'calc(100vh - 200px)' }}>
      {/* 将 Spin 组件移到内部，并使其包裹一个有确定大小的容器 */}
      <Content style={{ overflow: 'auto', padding: '0 12px', display: 'flex', flexDirection: 'column' }}>
        <Spin spinning={state === 'parsing' || state === 'analyzing'} tip={state === 'parsing' ? '正在解析文件...' : 'AI 正在分析中...'} size="large" style={{ maxHeight: '100%' }}>
          <div style={{ flexGrow: 1, overflow: 'auto' }}>
            <ResultsDisplay state={state} fileName={fileName} data={analysisResult} thinkingSteps={thinkingSteps} />
          </div>
        </Spin>
      </Content>
      <Layout.Sider width="100%" style={{ background: 'transparent', padding: '12px' }}>
        <ChatPanel onSendMessage={handleStartAnalysis} isAnalyzing={state === 'analyzing'} suggestions={suggestions} />
      </Layout.Sider>
    </Layout>
  );

  return (
    <AppLayout>
      <Sandbox ref={iframeRef} />
      <Breadcrumb items={[{ title: 'Vaultmind' }, { title: 'Workbench' }]} style={{ margin: '16px 0' }} />
      <div style={{ padding: 24, minHeight: 'calc(100vh - 112px)', background: colorBgContainer, borderRadius: borderRadiusLG, display: 'flex', flexDirection: 'column' }}>
        <Title level={2}>智能数据工作台</Title>
        <Paragraph>{state === 'waitingForFile' ? '欢迎来到 Vaultmind。请上传您的数据文件，然后通过对话开始您的分析之旅。' : <>当前分析文件: <strong>{fileName}</strong></>}</Paragraph>
        <Divider />
        {state === 'waitingForFile' ? renderInitialView() : renderAnalysisView()}
      </div>
    </AppLayout>
  );
};

const Workbench: React.FC = () => (<App><WorkbenchContent /></App>);

export default Workbench;

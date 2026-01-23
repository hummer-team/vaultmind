import React, { useState, useEffect, useRef } from 'react';
import { theme, Spin, App, Typography, Tag, Space, Drawer } from 'antd';
import { v4 as uuidv4 } from 'uuid';
import ChatPanel from './components/ChatPanel';
import ResultsDisplay from './components/ResultsDisplay';
import { SheetSelector } from './components/SheetSelector';
import { LLMConfig } from '../../services/llm/llmClient.ts';
import Sandbox from '../../components/layout/Sandbox';
import { useDuckDB } from '../../hooks/useDuckDB';
import { useFileParsing } from '../../hooks/useFileParsing';
import { WorkbenchState, Attachment } from '../../types/workbench.types';
import { settingsService } from '../../services/settingsService.ts';
import { resolveActiveLlmConfig, isValidLlmConfig } from '../../services/llm/runtimeLlmConfig.ts';
import { inferPersonaFromInput } from '../../utils/personaInferenceUtils.ts';
import { getPersonaById } from '../../config/personas';
import ProfilePage from "../settings/ProfilePage.tsx";
import { getPersonaSuggestions } from '../../config/personaSuggestions';
import { useUserStore } from '../../status/appStatusManager.ts';
import { runAgent } from '../../services/llm/agentRuntime.ts';

// Configuration
const MAX_FILES = Number(import.meta.env.VITE_MAX_FILES ?? 1); // Default to 1

interface AnalysisRecord {
  id: string;
  query: string;
  thinkingSteps: { tool: string; params: any; thought?: string } | null;
  data: any[] | { error: string } | null; // Changed from 'result' to 'data' and explicitly typed as array of any, now includes error object
  schema: any[] | null; // Added schema to the record
  status: 'analyzing' | 'resultsReady';
  llmDurationMs?: number;
  queryDurationMs?: number;
  // Snapshot of attachments at the time of this query
  attachmentsSnapshot?: Attachment[];
}

interface WorkbenchProps {
  isFeedbackDrawerOpen: boolean;
  setIsFeedbackDrawerOpen: (isOpen: boolean) => void;
}

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
    <Typography.Title level={3}>Hi, 自然语言即洞察，分析无边界</Typography.Title>
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
  // timer for persona hint auto clear
  const personaHintTimerRef = useRef<number | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { initializeDuckDB, executeQuery, isDBReady, dropTable } = useDuckDB(iframeRef);
  const { loadFileInDuckDB, loadSheetsInDuckDB, getSheetNamesFromExcel, isSandboxReady } = useFileParsing(iframeRef);

  const { userProfile } = useUserStore();

  const [uiState, setUiState] = useState<WorkbenchState>('initializing');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [chatError, setChatError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisRecord[]>([]);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [profileDrawerVisible, setProfileDrawerVisible] = useState(false);

  // 新增：当前输入框内容，用于“编辑”时回填
  const [currentInput, setCurrentInput] = useState<string>('');
  // persona hint message to show near ChatPanel
  const [personaHint, setPersonaHint] = useState<string | null>(null);

  // File size limits (Chrome extension runs in constrained memory environment)
  const MAX_SINGLE_FILE_BYTES = 200 * 1024 * 1024; // 200MB per file
  const MAX_TOTAL_FILES_BYTES = 500 * 1024 * 1024; // 500MB total across attachments
  const [uploadHint, setUploadHint] = useState<string | null>(null);
  const uploadHintTimerRef = useRef<number | null>(null);

  const showUploadHint = (msg: string) => {
    setUploadHint(msg);
    if (uploadHintTimerRef.current !== null) {
      window.clearTimeout(uploadHintTimerRef.current);
    }
    uploadHintTimerRef.current = window.setTimeout(() => {
      setUploadHint(null);
      uploadHintTimerRef.current = null;
    }, 4500);
  };

  const handlePersonaBadgeClick = () => {
    setProfileDrawerVisible(true);
  };

  const handleProfileDrawerClose = () => {
    setProfileDrawerVisible(false);
    // Recheck if persona has been set
    if (settingsService.hasSetPersona()) {
      const personaId = settingsService.getUserPersona();
      const personaSuggestions = getPersonaSuggestions(personaId || 'business_user');
      setSuggestions(personaSuggestions);
    }
  };

  // Initialize suggestions on component mount so users see tips immediately
  useEffect(() => {
    try {
      // Get persona from user profile skills (first skill) or fallback to business_user
      const profilePersonaId = userProfile?.skills?.[0];
      const personaId = profilePersonaId || 'business_user';

      const initial = getPersonaSuggestions(personaId);
      if (initial && initial.length > 0) setSuggestions(initial);
    } catch (e) {
      console.warn('[Workbench] Failed to load initial suggestions:', e);
    }
  }, [userProfile]);

  // State for multi-sheet handling
  const [sheetsToSelect, setSheetsToSelect] = useState<string[] | null>(null);
  const [fileToLoad, setFileToLoad] = useState<File | null>(null);

  const [llmConfig, setLlmConfig] = useState<LLMConfig>(() => ({
    provider: import.meta.env.VITE_LLM_PROVIDER as any,
    apiKey: import.meta.env.VITE_LLM_API_KEY as string,
    baseURL: import.meta.env.VITE_LLM_API_URL as string,
    modelName: import.meta.env.VITE_LLM_MODEL_NAME as string,
    mockEnabled: import.meta.env.VITE_LLM_MOCK === 'true',
  }));

  const [isLlmReady, setIsLlmReady] = useState<boolean>(isValidLlmConfig(llmConfig));

  useEffect(() => {
    let isMounted = true;
    const refresh = async () => {
      try {
        const { config, isReady } = await resolveActiveLlmConfig();
        if (!isMounted || !config) return;
        setLlmConfig(config);
        setIsLlmReady(isReady);
      } catch (error) {
        console.error('[Workbench] Failed to resolve active LLM config:', error);
        if (!isMounted) return;
        setIsLlmReady(false);
      }
    };

    // initial load
    refresh();
    // subscribe changes
    const unsubscribe = settingsService.subscribeLlmConfigChanges(() => {
      refresh();
    });
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const ensureLlmConfigured = (): boolean => {
    if (isLlmReady) return true;
    const hint = 'To enable AI analysis, please connect an LLM in Settings first.';
    showUploadHint(hint);
    setChatError(hint);
    return false;
  };

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

  // clear persona hint timer on unmount
  useEffect(() => {
    return () => {
      if (personaHintTimerRef.current !== null) {
        window.clearTimeout(personaHintTimerRef.current);
        personaHintTimerRef.current = null;
      }
    };
  }, []);

  const handleFileUpload = async (file: File) => {
    if (attachments.length >= MAX_FILES) {
      setChatError(`You can only upload a maximum of ${MAX_FILES} file(s).`);
      return false;
    }

    // Size guardrails
    const currentTotalBytes = attachments.reduce((sum, a) => sum + (a.file?.size ?? 0), 0);
    const nextTotalBytes = currentTotalBytes + (file.size ?? 0);

    if (file.size > MAX_SINGLE_FILE_BYTES) {
      showUploadHint('That file is a bit large for the browser. Please upload a smaller one (≤ 200MB).');
      return false;
    }

    if (nextTotalBytes > MAX_TOTAL_FILES_BYTES) {
      showUploadHint('Total uploads are getting heavy. Please remove a file or upload a smaller one (≤ 500MB total).');
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
      console.log('[Workbench] Loading file into DuckDB:', file.name);
      await loadFileInDuckDB(file, newAttachment.tableName);

      setAttachments((prev) =>
        prev.map((att) => (att.id === newAttachment.id ? { ...att, status: 'success' } : att))
      );
      // Load persona-specific suggestions
      const profilePersonaId = userProfile?.skills?.[0];
      const personaId = profilePersonaId || 'business_user';
      const loadedSuggestions = getPersonaSuggestions(personaId);
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

    // 这里不立刻把 sheetsToSelect 置空，让 SheetSelector 还留在页面上显示 loading
    setUiState('parsing');

    try {
      console.log('[Workbench] Loading sheets:', selectedSheets);
      const loadedAttachments = await loadSheetsInDuckDB(fileToLoad, selectedSheets, attachments.length);
      setAttachments(prev => [...prev, ...loadedAttachments]);

      // Load persona-specific suggestions
      const profilePersonaId = userProfile?.skills?.[0];
      const personaId = profilePersonaId || 'business_user';
      const loadedSuggestions = getPersonaSuggestions(personaId);
      setSuggestions(loadedSuggestions);
      setSheetsToSelect(null);
      setFileToLoad(null);
      setUiState('fileLoaded');
    } catch (error: any) {
      console.error(`[Workbench] Error loading sheets:`, error);
      setUiState('error');
      setChatError(`Failed to load sheets`);
      setSheetsToSelect(null);
      setFileToLoad(null);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    const attachmentToDelete = attachments.find((att) => att.id === attachmentId);
    if (!attachmentToDelete) return;

    const remainingAttachments = attachments.filter((att) => att.id !== attachmentId);
    setAttachments(remainingAttachments);

    if (remainingAttachments.length === 0 && analysisHistory.length === 0) {
      setUiState('waitingForFile');
    }

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
    if (!ensureLlmConfigured()) {
      return;
    }
    if (!executeQuery) {
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
    const newRecord: AnalysisRecord = {
      id: newRecordId,
      query,
      thinkingSteps: null,
      data: null,
      schema: null,
      status: 'analyzing',
      llmDurationMs: undefined,
      queryDurationMs: undefined,
      // take snapshot of current attachments
      attachmentsSnapshot: attachments,
    };
    setAnalysisHistory((prev) => [...prev, newRecord]);
    setUiState('analyzing');

    try {
      const profilePersonaId = userProfile?.skills?.[0];
      const inferredPersonaId = inferPersonaFromInput(query);
      const effectivePersonaId = inferredPersonaId || profilePersonaId || 'business_user';
      const effectivePersona = getPersonaById(effectivePersonaId);

      console.log('[Workbench] Persona inference:', {
        profile: profilePersonaId,
        inferred: inferredPersonaId,
        effective: effectivePersonaId
      });

      if (inferredPersonaId && inferredPersonaId !== profilePersonaId) {
        const hintText = `检测到你更像「${effectivePersona.displayName}」，已按该角色优化分析。`;
        setPersonaHint(hintText);
        if (personaHintTimerRef.current !== null) {
          window.clearTimeout(personaHintTimerRef.current);
        }
        personaHintTimerRef.current = window.setTimeout(() => {
          setPersonaHint(null);
          personaHintTimerRef.current = null;
        }, 2000);
      }

      const runtimeResult = await runAgent(
        {
          llmConfig,
          executeQuery,
          attachments,
        },
        query,
        signal,
        {
          personaId: effectivePersonaId,
          budget: {
            maxSteps: 2,
            maxToolCalls: 2,
            maxDurationMs: 20_000,
          },
        }
      );

      if (runtimeResult.cancelled) {
        setAnalysisHistory((prev) => prev.filter((rec) => rec.id !== newRecordId));
        setUiState('fileLoaded');
        return;
      }

      if (runtimeResult.stopReason !== 'SUCCESS') {
        const buildUserFacingError = (): string => {
          if (runtimeResult.stopReason === 'NEED_CLARIFICATION') {
            const raw = runtimeResult.message || '需要你补充一些信息后我才能继续分析。';
            // Normalize the internal prefix for better UX.
            return raw.replace(/^Need clarification:\s*/i, '需要你补充信息：\n');
          }
          if (runtimeResult.stopReason === 'POLICY_DENIED') {
            return '出于安全原因，这个请求不允许执行。你可以改为只读查询（SELECT）并限定范围。';
          }
          if (runtimeResult.stopReason === 'BUDGET_EXCEEDED') {
            return '本次分析超时了，请尝试缩小问题范围后重试。';
          }

          return runtimeResult.message || `分析失败：${runtimeResult.stopReason}`;
        };

        const msg = buildUserFacingError();
        setAnalysisHistory((prev) =>
          prev.map((rec) =>
            rec.id === newRecordId
              ? { ...rec, status: 'resultsReady', data: { error: msg }, schema: null }
              : rec
          )
        );
        return;
      }

      const resultPayload = runtimeResult.result as { data?: unknown; schema?: unknown } | null;
      const resultData = Array.isArray(resultPayload?.data) ? (resultPayload?.data as any[]) : null;
      const resultSchema = Array.isArray(resultPayload?.schema) ? (resultPayload?.schema as any[]) : null;

      const llmDurationMs: number | undefined = runtimeResult.llmDurationMs;
      const queryDurationMs: number | undefined = runtimeResult.queryDurationMs;

      setAnalysisHistory((prev) =>
        prev.map((rec) =>
          rec.id === newRecordId ? {
            ...rec,
            status: 'resultsReady',
            thinkingSteps: runtimeResult.tool
              ? { tool: runtimeResult.tool, params: runtimeResult.params, thought: runtimeResult.thought }
              : null,
            data: resultData,
            schema: resultSchema,
            llmDurationMs,
            queryDurationMs,
          } : rec
        )
      );
    } catch (error: any) {
      console.error('Analysis failed, updating record with error:', error);
      setAnalysisHistory((prev) =>
        prev.map((rec) =>
          rec.id === newRecordId ? { ...rec, status: 'resultsReady', data: { error: error.message }, schema: null } : rec
        )
      );
    } finally {
      setUiState('fileLoaded');
      abortControllerRef.current = null;
    }
  };

  // 新增：从结果卡片点“编辑”，把查询填回输入框
  const handleEditQuery = (query: string) => {
    setCurrentInput(query);
    // 滚动到底部，方便用户看到输入框
    contentRef.current?.scrollTo({ top: contentRef.current.scrollHeight, behavior: 'smooth' });
  };

  // 新增：从结果卡片点“复制”
  const handleCopyQuery = async (query: string) => {
    try {
      await navigator.clipboard.writeText(query);
      // success toast removed, UI 已足够明确
      // message.success('提示词已复制到剪贴板');
    } catch (e) {
      console.error('复制失败:', e);
      message.error('复制失败，请手动复制');
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
    // 非关键 success 提示移除，避免打断
    // message.success('Thanks for your feedback!');
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
    // 卡片消失即为最直观反馈，这里去掉 success 提示
    // message.success('分析记录已删除');
  };

  const handleScrollToBottom = () => {
    contentRef.current?.scrollTo({ top: contentRef.current.scrollHeight, behavior: 'smooth' });
  };

  const getLoadingTip = () => {
    if (uiState === 'initializing') return 'Initializing data engine...';
    if (uiState === 'parsing') return 'Parsing file(s)...';
    return '';
  };


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

    if (analysisHistory.length === 0) {
      return <InitialWelcomeView />;
    }

    return (
      <div>
        {analysisHistory.map((record) => (
          <ResultsDisplay
            key={record.id}
            query={record.query}
            status={record.status}
            data={record.data} // Pass data array
            schema={record.schema} // Pass schema array
            thinkingSteps={record.thinkingSteps}
            onUpvote={handleUpvote}
            onDownvote={handleDownvote}
            onRetry={handleRetry}
            onDelete={() => handleDeleteRecord(record.id)} // Pass delete handler
            llmDurationMs={record.llmDurationMs}
            queryDurationMs={record.queryDurationMs}
            // 新增：编辑 / 复制 回调
            onEditQuery={handleEditQuery}
            onCopyQuery={handleCopyQuery}
            // pass attachment snapshot for this record
            attachments={record.attachmentsSnapshot}
          />
        ))}
      </div>
    );
  };

  return (
    <>
      <Sandbox ref={iframeRef} />
      <div style={{ background: 'rgba(38, 38, 40, 0.6)', borderRadius: borderRadiusLG, display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', border: '1px solid rgba(255, 255, 255, 0.1)', backdropFilter: 'blur(10px)' }}>
        {/* Non-blocking top hint: show small spinner + text during initialization/parsing without blocking the UI */}
        <div style={{ padding: '12px 24px' }}>
          {uiState === 'initializing' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Spin size="small" />
              <span style={{ color: 'rgba(255,255,255,0.85)' }}>Vaultmind 引擎初始化中...</span>
            </div>
          )}
          {uiState === 'parsing' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Spin size="small" />
              <span style={{ color: 'rgba(255,255,255,0.85)' }}>{getLoadingTip()}</span>
            </div>
          )}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '24px' }}>
          <div ref={contentRef} style={{ flex: 1, overflow: 'auto' }}>
            {renderAnalysisView()}
          </div>
          <div style={{ flexShrink: 0, paddingTop: '12px' }}>
            <Drawer
              title="用户角色设置"
              placement="right"
              onClose={handleProfileDrawerClose}
              open={profileDrawerVisible}
              width={600}
              maskStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.3)' }}
              style={{
                background: 'rgba(24, 24, 28, 0.98)',
              }}
              bodyStyle={{
                padding: 24,
                background: 'rgba(24, 24, 28, 0.98)',
              }}
            >
              <ProfilePage />
            </Drawer>
            <ChatPanel
              onSendMessage={handleStartAnalysis}
              isAnalyzing={uiState === 'analyzing'}
              isInitializing={uiState === 'initializing'}
              onCancel={handleCancelAnalysis}
              suggestions={suggestions}
              onFileUpload={handleFileUpload}
              attachments={attachments}
              onDeleteAttachment={handleDeleteAttachment}
              error={chatError}
              setError={setChatError}
              showScrollToBottom={showScrollToBottom}
              onScrollToBottom={handleScrollToBottom}
              onPersonaBadgeClick={handlePersonaBadgeClick}
              // 新增：与输入框双向绑定，支持“编辑”回填
              initialMessage={currentInput}
              setInitialMessage={setCurrentInput}
              // new: inline persona hint for ChatPanel
              personaHint={personaHint}
              uploadHint={uploadHint}
              isLlmReady={isLlmReady}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default Workbench;

import React, { useState } from 'react';
import { Breadcrumb, theme, Typography, Divider, Row, Col, Spin, message } from 'antd';
import AppLayout from '../../components/layout/AppLayout';
import { InboxOutlined } from '@ant-design/icons';
import Dragger, { DraggerProps } from 'antd/es/upload/Dragger';
import ChatPanel from './components/ChatPanel';
import ResultsDisplay from './components/ResultsDisplay';

// const { Content } = Layout;
const { Title, Paragraph } = Typography;

// Define the states of the workbench
type WorkbenchState = 'waitingForFile' | 'fileLoaded' | 'analyzing' | 'resultsReady';

const Workbench: React.FC = () => {
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  const [state, setState] = useState<WorkbenchState>('waitingForFile');
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFileUpload: DraggerProps['onChange'] = (info) => {
    const { status } = info.file;
    if (status === 'done' || status === 'uploading') { // We simulate the upload process
      message.success(`${info.file.name} file uploaded successfully.`);
      setFileName(info.file.name);
      setState('fileLoaded');
    } else if (status === 'error') {
      message.error(`${info.file.name} file upload failed.`);
    }
  };

  const handleStartAnalysis = (query: string) => {
    console.log("Starting analysis with query:", query);
    setState('analyzing');
    // Simulate analysis delay
    setTimeout(() => {
      setState('resultsReady');
    }, 2000);
  };

  const renderContent = () => {
    switch (state) {
      case 'waitingForFile':
        return (
          <Dragger 
            name="file"
            multiple={false}
            beforeUpload={() => false} // Prevent actual upload, we handle it in onChange
            onChange={handleFileUpload}
            style={{ padding: '48px 0' }}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">点击或拖拽文件到此区域以上传</p>
            <p className="ant-upload-hint">支持 Excel (.xls, .xlsx) 和 CSV (.csv) 格式。</p>
          </Dragger>
        );
      case 'fileLoaded':
      case 'analyzing':
      case 'resultsReady':
        return (
          <Spin spinning={state === 'analyzing'} tip="AI 正在分析中..." size="large">
            <Row gutter={24}>
              <Col span={14}>
                <ChatPanel onSendMessage={handleStartAnalysis} isAnalyzing={state === 'analyzing'} />
              </Col>
              <Col span={10}>
                <ResultsDisplay state={state} fileName={fileName} />
              </Col>
            </Row>
          </Spin>
        );
      default:
        return null;
    }
  };

  return (
    <AppLayout>
      <Breadcrumb style={{ margin: '16px 0' }}>
        <Breadcrumb.Item>Vaultmind</Breadcrumb.Item>
        <Breadcrumb.Item>Workbench</Breadcrumb.Item>
      </Breadcrumb>
      <div
        style={{
          padding: 24,
          minHeight: 'calc(100vh - 112px)', // Adjust height to fill viewport
          background: colorBgContainer,
          borderRadius: borderRadiusLG,
        }}
      >
        <Title level={2}>智能数据工作台</Title>
        <Paragraph>
          {state === 'waitingForFile' 
            ? '欢迎来到 Vaultmind。请上传您的数据文件，然后通过对话开始您的分析之旅。'
            : `当前分析文件: <strong>${fileName}</strong>. 请在左侧对话框中输入您想分析的问题。`}
        </Paragraph>
        <Divider />
        {renderContent()}
      </div>
    </AppLayout>
  );
};

export default Workbench;

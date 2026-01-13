import React, { useState } from 'react';
import { Card, Empty, Typography, Table, Tag, Space, Divider, Spin, Alert, Button } from 'antd';
import { LikeOutlined, DislikeOutlined, RedoOutlined, LikeFilled } from '@ant-design/icons';

const { Paragraph, Text } = Typography;

interface ResultsDisplayProps {
  query: string;
  status: 'analyzing' | 'resultsReady';
  data: any;
  thinkingSteps: { tool: string; params: any, thought?: string } | null;
  onUpvote: (query: string) => void;
  onDownvote: (query: string) => void;
  onRetry: (query: string) => void;
}

const ThinkingSteps: React.FC<{ steps: { tool: string; params: any, thought?: string } }> = ({ steps }) => (
  <div style={{ marginBottom: 16 }}>
    <Paragraph><strong>AI 思考步骤:</strong></Paragraph>
    <Space direction="vertical" style={{ width: '100%' }}>
      {steps.thought && <Text><strong>思考:</strong> {steps.thought}</Text>}
      <Text>1. 决定调用工具: <Tag color="blue">{steps.tool}</Tag></Text>
      <Text>2. 准备了以下参数:</Text>
      <pre style={{ 
        background: '#1f2123',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        padding: '8px 12px', 
        borderRadius: 4, 
        whiteSpace: 'pre-wrap', 
        wordBreak: 'break-all' 
      }}>
        <code>{JSON.stringify(steps.params, null, 2)}</code>
      </pre>
    </Space>
  </div>
);

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ query, status, data, thinkingSteps, onUpvote, onDownvote, onRetry }) => {
  const [voted, setVoted] = useState<'up' | null>(null);

  const handleUpvoteClick = () => {
    setVoted('up');
    onUpvote(query);
  };

  const handleDownvoteClick = () => {
    onDownvote(query);
  };

  const handleRetryClick = () => {
    onRetry(query);
  };

  const renderContent = () => {
    // Define actions here so they are available for both success and error states
    const commonActions = (
      <Space size="small"> {/* Use Space component to control spacing */}
        <Button type="text" icon={voted === 'up' ? <LikeFilled style={{ color: '#1890ff' }} /> : <LikeOutlined />} onClick={handleUpvoteClick} />
        <Button type="text" icon={<DislikeOutlined />} onClick={handleDownvoteClick} />
        <Button type="text" icon={<RedoOutlined />} onClick={handleRetryClick} />
      </Space>
    );

    if (status === 'analyzing') {
      return (
        <Card 
          title={`Query: "${query}"`}
          // Actions are not typically shown during analyzing state, but if needed, can be added here
          style={{ background: '#2a2d30', border: '1px solid rgba(255, 255, 255, 0.15)' }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '150px' }}>
            <Spin tip="AI 正在分析中..." size="large" />
          </div>
        </Card>
      );
    }

    if (status === 'resultsReady') {
      if (data && data.error) {
        return (
          <Card actions={[commonActions]} style={{ background: '#2a2d30', border: '1px solid rgba(255, 255, 255, 0.15)' }}>
            <Alert
              message="分析失败"
              description={data.error}
              type="error"
              showIcon
            />
          </Card>
        );
      }

      if (!data) {
        return <Card actions={[commonActions]}><Empty description="分析完成，但没有返回结果。" /></Card>;
      }

      const { columns: originalColumns, rows } = data;

      if (!originalColumns || !rows || rows.length === 0) {
        return <Card actions={[commonActions]}><Empty description="分析完成，但没有返回结果。" /></Card>;
      }

      const tableColumns = originalColumns.map((colName: string, index: number) => ({
        title: colName,
        dataIndex: `col_${index}`,
        key: `col_${index}`,
      }));

      const tableDataSource = rows.map((row: any[], rowIndex: number) => {
        const rowObject: { [key: string]: any } = { key: `row-${rowIndex}` };
        originalColumns.forEach((_colName: string, colIndex: number) => {
          rowObject[`col_${colIndex}`] = row[colIndex];
        });
        return rowObject;
      });

      return (
        <Card 
          title={`Query: "${query}"`}
          actions={[commonActions]} // Pass the Space component as an array to actions
          style={{ background: '#2a2d30', border: '1px solid rgba(255, 255, 255, 0.15)' }}
        >
          {thinkingSteps && (
            <>
              <ThinkingSteps steps={thinkingSteps} />
              <Divider style={{ borderColor: 'rgba(255, 255, 255, 0.15)' }} />
            </>
          )}
          <Paragraph><strong>分析结果:</strong></Paragraph>
          <Table
            dataSource={tableDataSource}
            columns={tableColumns}
            pagination={{ pageSize: 5 }}
            size="small"
          />
        </Card>
      );
    }
    
    return null;
  };

  return (
    <div style={{ marginBottom: '24px' }}>
      {renderContent()}
    </div>
  );
};

export default ResultsDisplay;

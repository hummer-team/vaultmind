import React, { useState } from 'react';
import { Card, Empty, Typography, Table, Tag, Space, Divider, Spin, Alert, Button, Collapse, Avatar } from 'antd';
import { LikeOutlined, DislikeOutlined, RedoOutlined, LikeFilled } from '@ant-design/icons';

const { Paragraph} = Typography;

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
  <Collapse ghost>
    <Collapse.Panel header="思考过程" key="1">
      <Space direction="vertical" style={{ width: '100%', gap: '16px' }}>
        {steps.thought && (
          <Space align="start">
            <Avatar src="/icons/icon-128.png" size={24} />
            <Typography.Text style={{ color: '#d9d9d9' }}>{steps.thought}</Typography.Text>
          </Space>
        )}

        <div>
          <Typography.Text strong>1. 决定调用工具</Typography.Text>
          <div style={{ marginTop: '4px' }}>
            <Tag color="blue">{steps.tool}</Tag>
          </div>
        </div>
        <div>
          <Typography.Text strong>2. 准备了以下参数</Typography.Text>
          <pre style={{
            background: '#1f2123',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '8px 12px',
            borderRadius: 4,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            marginTop: '4px'
          }}>
            <code>{JSON.stringify(steps.params, null, 2)}</code>
          </pre>
        </div>
      </Space>
    </Collapse.Panel>
  </Collapse>
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
    const commonActions = (
      <div style={{ paddingTop: '8px' }}>
        <Space size="small">
          <Button type="text" icon={voted === 'up' ? <LikeFilled style={{ color: '#1890ff' }} /> : <LikeOutlined />} onClick={handleUpvoteClick} />
          <Button type="text" icon={<DislikeOutlined />} onClick={handleDownvoteClick} />
          <Button type="text" icon={<RedoOutlined />} onClick={handleRetryClick} />
        </Space>
      </div>
    );

    if (status === 'analyzing') {
      return (
        <Card 
          title={`Query: "${query}"`}
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
          actions={[commonActions]}
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
            pagination={{
              defaultPageSize: 20,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
            }}
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

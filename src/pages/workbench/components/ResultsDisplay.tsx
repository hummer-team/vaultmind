import React, { useState } from 'react';
import { Card, Empty, Typography, Table, Tag, Space, Divider, Spin, Alert, Button, Collapse, Avatar, Popconfirm } from 'antd';
import { LikeOutlined, DislikeOutlined, RedoOutlined, LikeFilled, DeleteOutlined } from '@ant-design/icons';

const { Paragraph } = Typography;

interface ResultsDisplayProps {
  query: string;
  status: 'analyzing' | 'resultsReady';
  data: any;
  thinkingSteps: { tool: string; params: any, thought?: string } | null;
  onUpvote: (query: string) => void;
  onDownvote: (query: string) => void;
  onRetry: (query: string) => void;
  onDelete: () => void;
}

const ThinkingSteps: React.FC<{ steps: { tool: string; params: any, thought?: string } }> = ({ steps }) => (
  <Collapse ghost style={{ margin: '0 -24px' }}>
    <Collapse.Panel header="查看AI思考过程" key="1">
      <div style={{ padding: '16px 24px 0 24px' }}>
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
      </div>
    </Collapse.Panel>
  </Collapse>
);


const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ query, status, data, thinkingSteps, onUpvote, onDownvote, onRetry, onDelete }) => {
  const [voted, setVoted] = useState<'up' | null>(null);

  const handleUpvoteClick = () => {
    setVoted('up');
    onUpvote(query);
  };

  const renderContent = () => {
    const commonActions = (
        <div style={{
          padding: '0',
          lineHeight: '1',
          height: '16px'
        }}>
          <Space size={0}>
            <Button
                type="text"
                icon={voted === 'up'
                    ? <LikeFilled style={{
                      color: '#1890ff',
                      fontSize: '12px',
                      verticalAlign: 'middle'
                    }} />
                    : <LikeOutlined style={{
                      fontSize: '12px',
                      verticalAlign: 'middle'
                    }} />
                }
                onClick={handleUpvoteClick}
                style={{
                  padding: '0',
                  margin: '0',
                  height: '12px',
                  minHeight: '12px',
                  minWidth: 'unset',
                  lineHeight: '1',
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  cursor: 'pointer'
                }}
            />
            <Button
                type="text"
                icon={<DislikeOutlined style={{
                  fontSize: '12px',
                  verticalAlign: 'middle'
                }} />}
                onClick={() => onDownvote(query)}
                style={{
                  padding: '0',
                  margin: '0',
                  height: '12px',
                  minHeight: '12px',
                  minWidth: 'unset',
                  lineHeight: '1',
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  cursor: 'pointer'
                }}
            />
            <Button
                type="text"
                icon={<RedoOutlined style={{
                  fontSize: '12px',
                  verticalAlign: 'middle'
                }} />}
                onClick={() => onRetry(query)}
                style={{
                  padding: '0',
                  margin: '0',
                  height: '12px',
                  minHeight: '12px',
                  minWidth: 'unset',
                  lineHeight: '1',
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  cursor: 'pointer'
                }}
            />
            <Popconfirm
                title="您确定要删除此条记录吗？"
                onConfirm={onDelete}
                okText="确定"
                cancelText="取消"
            >
              <Button
                  type="text"
                  icon={<DeleteOutlined style={{
                    fontSize: '12px',
                    verticalAlign: 'middle',
                    color: '#ff4d4f'
                  }} />}
                  danger
                  style={{
                    padding: '0',
                    margin: '0',
                    height: '12px',
                    minHeight: '12px',
                    minWidth: 'unset',
                    lineHeight: '1',
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    cursor: 'pointer'
                  }}
              />
            </Popconfirm>
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
          bodyStyle={{ padding: '0 24px 12px 24px' }}
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            {thinkingSteps && (
              <>
                <ThinkingSteps steps={thinkingSteps} />
                <Divider style={{ borderColor: 'rgba(255, 255, 255, 0.15)', margin: '0' }} />
              </>
            )}
            <Paragraph style={{ paddingTop: '16px' }}><strong>分析结果:</strong></Paragraph>
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
          </Space>
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

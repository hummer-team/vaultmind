import React, { useState } from 'react';
import { Card, Empty, Typography, Table, Tag, Space, Divider, Spin, Alert, Button, Collapse, Avatar, Popconfirm } from 'antd';
import { LikeOutlined, DislikeOutlined, RedoOutlined, LikeFilled, DeleteOutlined, EditOutlined, CopyOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table'; // Import ColumnsType for better typing
import ReactMarkdown from 'react-markdown';

const { Paragraph } = Typography;

interface ResultsDisplayProps {
  query: string;
  status: 'analyzing' | 'resultsReady';
  data: any[] | { error: string } | null; // Data can be an array of objects, an error object, or null
  schema: any[] | null; // Schema is an array of objects with { name: string, type: string }
  thinkingSteps: { tool: string; params: any, thought?: string } | null;
  onUpvote: (query: string) => void;
  onDownvote: (query: string) => void;
  onRetry: (query: string) => void;
  onDelete: () => void;
  llmDurationMs?: number;    // <-- 新增：LLM 耗时（毫秒）
  queryDurationMs?: number;  // <-- 新增：查询耗时（毫秒）
  onEditQuery: (query: string) => void;
  onCopyQuery: (query: string) => void;
}

// 将毫秒转为秒字符串，如 "耗时 1.2s"
const formatDurationSeconds = (ms?: number): string | null => {
  if (ms == null || !Number.isFinite(ms)) return null;
  const seconds = ms / 1000;
  return `耗时 ${seconds.toFixed(1)}s`;
};

const ThinkingSteps: React.FC<{ steps: { tool: string; params: any, thought?: string }, llmDurationMs?: number }> = ({ steps, llmDurationMs }) => {
  const llmDurationLabel = formatDurationSeconds(llmDurationMs);

  return (
    <Collapse ghost style={{ margin: '0 -24px' }}>
      <Collapse.Panel
        header={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>查看AI思考过程</span>
            {llmDurationLabel && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {llmDurationLabel}
              </Typography.Text>
            )}
          </div>
        }
        key="1"
      >
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
};

// Helper to format Date into UTC 'YYYY-MM-DD HH:mm:ss'
const formatDateToUTCString = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getUTCFullYear();
  const month = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const hours = pad(d.getUTCHours());
  const minutes = pad(d.getUTCMinutes());
  const seconds = pad(d.getUTCSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`;
};

// Helper function to format TIMESTAMP values
const formatTimestamp = (value: any): string => {
  if (value instanceof Date) {
    return formatDateToUTCString(value);
  }
  // If it's an ISO-like string (ends with Z or contains 'T'), parse it and show UTC
  if (typeof value === 'string' && (/^\d{4}-\d{2}-\d{2}T/.test(value) || value.endsWith('Z'))) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return formatDateToUTCString(d);
  }
  // Attempt to parse if it's a string that looks like a date
  if (typeof value === 'string' && !isNaN(Date.parse(value))) {
    const d = new Date(value);
    return formatDateToUTCString(d);
  }
  // If it's a number, attempt to detect seconds/milliseconds/microseconds
  if (typeof value === 'number') {
    let ms = value;
    if (value > 1e14) {
      // assume microseconds -> convert to ms
      ms = Math.floor(value / 1000);
    } else if (value > 1e12) {
      // likely milliseconds; use as-is
      ms = value;
    } else if (value > 1e9) {
      // likely seconds -> convert to ms
      ms = value * 1000;
    } else {
      // fallback: treat as ms
      ms = value;
    }

    const d = new Date(ms);
    if (!isNaN(d.getTime())) {
      return formatDateToUTCString(d);
    }
    return String(value);
  }
  return String(value);
};

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ query, status, data, schema, thinkingSteps, onUpvote, onDownvote, onRetry, onDelete, llmDurationMs, queryDurationMs, onEditQuery, onCopyQuery }) => {
  const [voted, setVoted] = useState<'up' | null>(null);
  const queryDurationLabel = formatDurationSeconds(queryDurationMs);

  const handleUpvoteClick = () => {
    setVoted('up');
    onUpvote(query);
  };

  const renderContent = () => {
    const iconStyle = { fontSize: '16px' };
    const commonActions = (
      <div style={{ padding: '2px 0' }}>
        <Space size="small">
          <Button
            type="text"
            icon={voted === 'up'
              ? <LikeFilled style={{ ...iconStyle, color: '#1890ff' }} />
              : <LikeOutlined style={iconStyle} />
            }
            onClick={handleUpvoteClick}
          />
          <Button
            type="text"
            icon={<DislikeOutlined style={iconStyle} />}
            onClick={() => onDownvote(query)}
          />
          <Button
            type="text"
            icon={<RedoOutlined style={iconStyle} />}
            onClick={() => onRetry(query)}
          />
          <Popconfirm
            title="您确定要删除此条记录吗？"
            onConfirm={onDelete}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="text"
              icon={<DeleteOutlined style={{ ...iconStyle, color: '#ff4d4f' }} />}
              danger
            />
          </Popconfirm>
        </Space>
      </div>
    );

    // 公共的 Card 标题：左侧为 Markdown 渲染的 Query，右侧是编辑/复制按钮（右上角对齐）
    const renderCardTitle = () => (
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start', // 关键：两侧都从容器顶部对齐
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <Typography.Text style={{ whiteSpace: 'pre-wrap' }}>
            <ReactMarkdown>{`**Query:** ${query}`}</ReactMarkdown>
          </Typography.Text>
        </div>
        <Space
          size="small"
          style={{
            flexShrink: 0,
            alignSelf: 'flex-start', // 确保按钮组本身贴着上边缘
          }}
        >
          <Button
            size="small"
            type="text"
            icon={<EditOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              onEditQuery(query);
            }}
          >
            编辑
          </Button>
          <Button
            size="small"
            type="text"
            icon={<CopyOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              onCopyQuery(query);
            }}
          >
            复制
          </Button>
        </Space>
      </div>
    );

    if (status === 'analyzing') {
      return (
        <Card
          title={renderCardTitle()}
          style={{ background: '#2a2d30', border: '1px solid rgba(255, 255, 255, 0.15)' }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '150px' }}>
            <Spin tip="AI 正在分析中..." size="large" />
          </div>
        </Card>
      );
    }

    if (status === 'resultsReady') {
      const cardProps = {
        title: renderCardTitle(),
        actions: [commonActions],
        style: { background: '#2a2d30', border: '1px solid rgba(255, 255, 255, 0.15)' },
        bodyStyle: { padding: '0 24px 8px 24px' },
      };

      const commonContent = (
        <Space direction="vertical" style={{ width: '100%' }}>
          {thinkingSteps && (
            <>
              <ThinkingSteps steps={thinkingSteps} llmDurationMs={llmDurationMs} />
              <Divider style={{ borderColor: 'rgba(255, 255, 255, 0.15)', margin: '0' }} />
            </>
          )}
          <div
            style={{
              paddingTop: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Paragraph style={{ margin: 0 }}>
              <strong>分析结果:</strong>
            </Paragraph>
            {queryDurationLabel && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {queryDurationLabel}
              </Typography.Text>
            )}
          </div>
        </Space>
      );

      // Handle error data
      if (data && typeof data === 'object' && 'error' in data) {
        return (
          <Card {...cardProps}>
            {commonContent}
            <Alert
              message="抱歉，我无法理解您的指令"
              description={data.error}
              type="error"
              showIcon
              style={{ marginTop: '16px' }}
            />
            <Paragraph type="secondary" style={{ marginTop: '16px' }}>
              请尝试调整您的指令，例如更具体地描述您想要的数据或分析类型。
            </Paragraph>
          </Card>
        );
      }

      // Ensure data is an array and schema is present
      const actualData = data as any[];
      if (!actualData || actualData.length === 0 || !schema || schema.length === 0) {
        return (
          <Card {...cardProps}>
            {commonContent}
            <Empty description="分析完成，但没有返回结果。" style={{ marginTop: '16px' }} />
            <Paragraph type="secondary" style={{ marginTop: '16px' }}>
              请尝试调整您的指令，例如更具体地描述您想要的数据或分析类型。
            </Paragraph>
          </Card>
        );
      }

      // Construct columns using schema information
      const tableColumns: ColumnsType<any> = schema.map((col: any) => {
        let renderFunction;
        const typeStr = String(col.type || '').toLowerCase();
        // Match timestamp/date/time types in a case-insensitive and flexible way
        if (typeStr.includes('timestamp') || typeStr.includes('date') || typeStr.includes('time')) {
          renderFunction = (text: any) => formatTimestamp(text);
        } else if (typeStr.includes('boolean')) {
          renderFunction = (text: any) => (typeof text === 'boolean' ? (text ? 'True' : 'False') : String(text));
        }
        // Add more type-specific render functions here as needed (e.g., DECIMAL, DATE, TIME)

        return {
          title: col.name,
          dataIndex: col.name, // dataIndex should match the key in the data objects
          key: col.name,
          render: renderFunction,
        };
      });

      // Data is already an array of objects, just need to add a key for Ant Design Table
      const tableDataSource = actualData.map((row: any, rowIndex: number) => ({
        ...row,
        key: `row-${rowIndex}`, // Add a unique key for each row
      }));

      return (
        <Card {...cardProps}>
          {commonContent}
          <Table
            dataSource={tableDataSource}
            columns={tableColumns}
            pagination={{
              defaultPageSize: 20,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
            }}
            size="small"
            scroll={{ x: 'max-content' }} // Enable horizontal scrolling for many columns
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

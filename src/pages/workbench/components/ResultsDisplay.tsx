import React from 'react';
import { Card, Empty, Typography, Table, Tag, Space } from 'antd';
import { BarChartOutlined, CodeOutlined, TableOutlined } from '@ant-design/icons';
import { WorkbenchState } from '../../../types/workbench.types'; // 更新导入路径

const { Paragraph, Text } = Typography;

interface ResultsDisplayProps {
  state: WorkbenchState;
  fileName: string | null;
  data: any;
  thinkingSteps: { tool: string; params: any } | null;
}

const ThinkingSteps: React.FC<{ steps: { tool: string; params: any } }> = ({ steps }) => (
  <Card size="small" title={<><CodeOutlined /> AI 思考步骤</>} style={{ marginBottom: 16 }}>
    <Space direction="vertical">
      <Text>1. 理解用户意图后，决定调用工具: <Tag color="blue">{steps.tool}</Tag></Text>
      <Text>2. 为该工具准备了以下参数:</Text>
      <pre style={{ background: '#222', padding: '8px 12px', borderRadius: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        <code>{JSON.stringify(steps.params, null, 2)}</code>
      </pre>
    </Space>
  </Card>
);

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ state, fileName, data, thinkingSteps }) => {
  const renderContent = () => {
    switch (state) {
      case 'fileLoaded':
        return (
          <Empty
            image={<TableOutlined style={{ fontSize: 48 }} />}
            description={
              <>
                <Paragraph>文件 <strong>{fileName}</strong> 已准备就绪。</Paragraph>
                <Paragraph>请在下方对话框中提出您的问题，开始分析。</Paragraph>
              </>
            }
          />
        );
      case 'analyzing':
        return (
          <Empty
            image={<BarChartOutlined style={{ fontSize: 48, animation: 'ant-slide-up 1.5s infinite' }} />}
            description="正在生成分析结果..."
          />
        );
      case 'resultsReady':
        console.log('[ResultsDisplay] Rendering with state "resultsReady". Received data:', data);

        const { columns: originalColumns, rows } = data;

        if (!originalColumns || !rows || rows.length === 0) {
          return <Empty description="分析完成，但没有返回结果。" />;
        }

        // --- CRITICAL CHANGE: Create a robust mapping for columns and data ---
        const tableColumns = originalColumns.map((colName: string, index: number) => ({
          title: colName, // Keep original name for display
          dataIndex: `col_${index}`, // Use a simple, safe index-based key for data access
          key: `col_${index}`,
        }));

        const tableDataSource = rows.map((row: any[], rowIndex: number) => {
          const rowObject: { [key: string]: any } = { key: `row-${rowIndex}` };
          originalColumns.forEach((_colName: string, colIndex: number) => {
            rowObject[`col_${colIndex}`] = row[colIndex]; // Map data to the safe, index-based key
          });
          return rowObject;
        });
        // --- END CRITICAL CHANGE ---
        console.log('[ResultsDisplay] Mapped data for Table:', tableDataSource," tableColumns",tableColumns);

        return (
          <div>
            {thinkingSteps && <ThinkingSteps steps={thinkingSteps} />}
            <Paragraph><strong>分析结果:</strong></Paragraph>
            <Table
              dataSource={tableDataSource}
              columns={tableColumns}
              pagination={{ pageSize: 5 }}
              size="small"
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      {renderContent()}
    </div>
  );
};

export default ResultsDisplay;

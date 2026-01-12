import React from 'react';
import { Card, Empty, Typography, Table, Tag, Space, Divider } from 'antd';
import { BarChartOutlined, TableOutlined } from '@ant-design/icons';
import { WorkbenchState } from '../../../types/workbench.types'; // 更新导入路径

const { Paragraph, Text } = Typography;

interface ResultsDisplayProps {
  state: WorkbenchState;
  fileName: string | null;
  data: any;
  thinkingSteps: { tool: string; params: any } | null;
}

const ThinkingSteps: React.FC<{ steps: { tool: string; params: any } }> = ({ steps }) => (
  // --- CRITICAL CHANGE 1: Remove Card wrapper and adjust styles ---
  <div style={{ marginBottom: 16 }}>
    <Paragraph><strong>AI 思考步骤:</strong></Paragraph>
    <Space direction="vertical" style={{ width: '100%' }}>
      <Text>1. 理解用户意图后，决定调用工具: <Tag color="blue">{steps.tool}</Tag></Text>
      <Text>2. 为该工具准备了以下参数:</Text>
      {/* --- CRITICAL CHANGE: Adjust pre background color --- */}
      <pre style={{ 
        border: '1px solid #e8e8e8', // Keep the subtle border
        padding: '8px 12px', 
        borderRadius: 4, 
        whiteSpace: 'pre-wrap', 
        wordBreak: 'break-all' 
        // Background color is now removed to inherit from the parent
      }}>
        <code>{JSON.stringify(steps.params, null, 2)}</code>
      </pre>
      {/* --- END CRITICAL CHANGE --- */}
    </Space>
  </div>
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

        // --- CRITICAL CHANGE 2: Merge ThinkingSteps and Results into a single Card ---
        return (
          <Card title={`Analysis Result for ${fileName}`}>
            {thinkingSteps && (
              <>
                <ThinkingSteps steps={thinkingSteps} />
                <Divider />
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
        // --- END CRITICAL CHANGE ---
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

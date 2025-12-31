import React from 'react';
import { Card, Empty, Typography } from 'antd';
import { BarChartOutlined, TableOutlined } from '@ant-design/icons';

const { Paragraph } = Typography;

type WorkbenchState = 'waitingForFile' | 'fileLoaded' | 'analyzing' | 'resultsReady';

interface ResultsDisplayProps {
  state: WorkbenchState;
  fileName: string | null;
}

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ state, fileName }) => {
  const renderContent = () => {
    switch (state) {
      case 'fileLoaded':
        return (
          <Empty
            image={<TableOutlined style={{ fontSize: 48 }} />}
            description={
              <>
                <Paragraph>文件 <strong>{fileName}</strong> 已准备就绪。</Paragraph>
                <Paragraph>请在左侧对话框中提出您的问题，开始分析。</Paragraph>
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
        return (
          <div>
            <Paragraph><strong>分析结果:</strong></Paragraph>
            <p>这里将显示图表或表格...</p>
            {/* Example of a placeholder for a chart */}
            <div style={{ height: 200, background: '#333', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: '#888' }}>Chart Placeholder</p>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Card title="分析结果" bordered={false} style={{ minHeight: 428 }}>
      {renderContent()}
    </Card>
  );
};

export default ResultsDisplay;

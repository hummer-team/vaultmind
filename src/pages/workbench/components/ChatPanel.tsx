import React from 'react';
import { Input, Button, Form, Card } from 'antd';
import { SendOutlined } from '@ant-design/icons';

interface ChatPanelProps {
  onSendMessage: (message: string) => void;
  isAnalyzing: boolean;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ onSendMessage, isAnalyzing }) => {
  const [form] = Form.useForm();

  const handleFinish = (values: { message: string }) => {
    if (values.message && values.message.trim()) {
      onSendMessage(values.message.trim());
      form.resetFields();
    }
  };

  return (
    <Card title="对话分析" bordered={false}>
      <div style={{ minHeight: 300, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        {/* Chat history will go here */}
        <div style={{ flexGrow: 1, marginBottom: 16 }}>
          <p style={{ color: '#888' }}>例如: "哪个城市的销售额最高？" 或 "按月统计订单数量的变化趋势。"</p>
        </div>
        <Form form={form} onFinish={handleFinish}>
          <Form.Item name="message" style={{ marginBottom: 0 }}>
            <Input.Group compact>
              <Input
                style={{ width: 'calc(100% - 78px)' }}
                placeholder="请输入您的问题..."
                disabled={isAnalyzing}
                autoComplete="off"
              />
              <Button
                type="primary"
                htmlType="submit"
                icon={<SendOutlined />}
                loading={isAnalyzing}
              >
                发送
              </Button>
            </Input.Group>
          </Form.Item>
        </Form>
      </div>
    </Card>
  );
};

export default ChatPanel;

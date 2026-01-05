import React from 'react';
import { Input, Button, Form, Tag, Space } from 'antd';
import { SendOutlined } from '@ant-design/icons';

interface ChatPanelProps {
  onSendMessage: (message: string) => void;
  isAnalyzing: boolean;
  suggestions?: string[];
}

const ChatPanel: React.FC<ChatPanelProps> = ({ onSendMessage, isAnalyzing, suggestions }) => {
  const [form] = Form.useForm();

  const handleFinish = (values: { message: string }) => {
    if (values.message && values.message.trim()) {
      onSendMessage(values.message.trim());
      form.resetFields();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    form.setFieldsValue({ message: suggestion });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Chat history will go here in the future */}
      <div style={{ flexGrow: 1, overflow: 'auto', paddingBottom: 16 }}>
        {suggestions && suggestions.length > 0 && (
          <div>
            <p style={{ color: '#888', marginBottom: 8 }}>您可以试试这样问：</p>
            <div>
              {suggestions.map((s, i) => (
                <Tag 
                  key={i} 
                  onClick={() => handleSuggestionClick(s)}
                  style={{ cursor: 'pointer', marginBottom: 8 }}
                >
                  {s}
                </Tag>
              ))}
            </div>
          </div>
        )}
      </div>
      <Form form={form} onFinish={handleFinish}>
        <Form.Item name="message" style={{ marginBottom: 0 }}>
          {/* CORRECTED: Replaced Input.Group with Space.Compact */}
          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder="例如: 哪个产品的销售额最高？"
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
          </Space.Compact>
        </Form.Item>
      </Form>
    </div>
  );
};

export default ChatPanel;

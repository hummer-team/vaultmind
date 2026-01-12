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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Suggestions at the top */}
      {suggestions && suggestions.length > 0 && (
        <Space size={[0, 8]} wrap>
          {suggestions.map((s, i) => (
            <Tag 
              key={i} 
              onClick={() => handleSuggestionClick(s)}
              style={{ cursor: 'pointer' }}
            >
              {s}
            </Tag>
          ))}
        </Space>
      )}

      {/* --- CRITICAL CHANGE: Restructure Form for new layout --- */}
      <Form form={form} onFinish={handleFinish} layout="vertical">
        <Form.Item name="message" noStyle>
          <Input.TextArea
            placeholder="请输入您的问题或分析指令..."
            disabled={isAnalyzing}
            style={{ height: 120, resize: 'none' }}
            onPressEnter={(e) => {
              if (!e.shiftKey && !isAnalyzing) {
                e.preventDefault();
                form.submit();
              }
            }}
          />
        </Form.Item>

        {/* The Button is now a separate element, aligned left by default */}
        <Form.Item style={{ marginTop: '8px', marginBottom: 0 }}>
          <Button
            type="primary"
            htmlType="submit"
            icon={<SendOutlined />}
            loading={isAnalyzing}
          >
            发送
          </Button>
        </Form.Item>
      </Form>
      {/* --- END CRITICAL CHANGE --- */}
    </div>
  );
};

export default ChatPanel;

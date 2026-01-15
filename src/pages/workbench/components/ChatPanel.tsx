import React from 'react';
import { Input, Button, Form, Tag, Space, Upload, FloatButton, Typography, Spin, Tooltip } from 'antd';
import { PaperClipOutlined, DownOutlined, CloseCircleFilled, StopOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { Attachment } from '../../../types/workbench.types';
import './ChatPanel.css'; // Import a CSS file for animations

interface ChatPanelProps {
  onSendMessage: (message: string) => void;
  isAnalyzing: boolean;
  onCancel: () => void;
  suggestions?: string[];
  onFileUpload: (file: File) => Promise<boolean | void>;
  attachments: Attachment[];
  onDeleteAttachment: (attachmentId: string) => void;
  error: string | null;
  setError: (error: string | null) => void;
  showScrollToBottom: boolean;
  onScrollToBottom: () => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({
  onSendMessage,
  isAnalyzing,
  onCancel,
  suggestions,
  onFileUpload,
  attachments,
  onDeleteAttachment,
  error,
  setError,
  showScrollToBottom,
  onScrollToBottom,
}) => {
  const [form] = Form.useForm();

  const handleFinish = (values: { message: string }) => {
    if (!values.message || !values.message.trim()) {
      setError('Please enter a prompt.');
      return;
    }
    setError(null);
    onSendMessage(values.message.trim());
    form.resetFields();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !isAnalyzing) {
      e.preventDefault();
      form.submit();
    }
  };

  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    beforeUpload: onFileUpload,
    showUploadList: false,
    accept: '.csv,.xls,.xlsx',
    disabled: isAnalyzing,
  };

  const placeholderText = [
    '1. Upload supported formats: Excel, CSV. Max file size: 1GB.',
    '2. Enter your question or analysis instruction.',
    '3. Press Control+Enter to submit.',
  ].join('\n');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative' }}>
      <FloatButton
        icon={<DownOutlined />}
        onClick={onScrollToBottom}
        style={{
          display: showScrollToBottom ? 'block' : 'none',
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          top: '-50px',
          zIndex: 10,
          width: '40px',
          height: '40px',
          padding: 0,
          lineHeight: '40px'
        }}
      />

      {/* Suggestions */}
      {suggestions && suggestions.length > 0 && (
        <Space size={[0, 8]} wrap>
          {suggestions.map((s, i) => (
            <Tag key={i} onClick={() => form.setFieldsValue({ message: s })} style={{ cursor: 'pointer' }}>
              {s}
            </Tag>
          ))}
        </Space>
      )}

      {/* Attachments Display */}
      {attachments.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '0 8px' }}>
          {attachments.map((att) => (
            <Tag
              key={att.id}
              closable
              onClose={() => onDeleteAttachment(att.id)}
              icon={att.status === 'uploading' ? <Spin size="small" /> : undefined}
              color={att.status === 'error' ? 'error' : 'default'}
              style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              {att.file.name}
              {att.status === 'error' && <Tooltip title={att.error}><CloseCircleFilled /></Tooltip>}
            </Tag>
          ))}
        </div>
      )}

      <Form form={form} onFinish={handleFinish} layout="vertical">
        <div style={{ position: 'relative' }}>
          <Form.Item name="message" noStyle>
            <Input.TextArea
              placeholder={placeholderText}
              disabled={isAnalyzing}
              style={{ height: 120, resize: 'none', paddingBottom: '40px', paddingRight: '40px' }}
              onKeyDown={handleKeyDown}
              onChange={() => error && setError(null)}
            />
          </Form.Item>
          <div style={{ position: 'absolute', bottom: '8px', left: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Upload {...uploadProps}>
              <Button icon={<PaperClipOutlined />} disabled={isAnalyzing} />
            </Upload>
            {error && (
              <Typography.Text type="danger" style={{ fontSize: '12px' }}>
                {error}
              </Typography.Text>
            )}
          </div>
          {isAnalyzing && (
            <Tooltip title="Cancel Analysis">
              <Button
                shape="circle"
                icon={<StopOutlined />}
                onClick={onCancel}
                className="cancel-button-pulse"
                style={{
                  position: 'absolute',
                  bottom: '8px',
                  right: '8px',
                }}
              />
            </Tooltip>
          )}
        </div>
      </Form>
    </div>
  );
};

export default ChatPanel;

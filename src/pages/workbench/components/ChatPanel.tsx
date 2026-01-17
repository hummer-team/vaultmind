import React, { useMemo } from 'react';
import { Input, Button, Form, Tag, Space, Upload, FloatButton, Typography, Spin, Tooltip } from 'antd';
import { PaperClipOutlined, DownOutlined, CloseCircleFilled, StopOutlined, FileExcelOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { Attachment } from '../../../types/workbench.types';
import './ChatPanel.css'; // Import a CSS file for animations

interface ChatPanelProps {
  onSendMessage: (message: string) => void;
  isAnalyzing: boolean;
  isInitializing?: boolean;
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

interface GroupedAttachment {
  fileName: string;
  file: File;
  sheetNames: string[];
  attachmentIds: string[];
  status: 'uploading' | 'success' | 'error';
  error?: string;
}

const ChatPanel: React.FC<ChatPanelProps> = ({
  onSendMessage,
  isAnalyzing,
  isInitializing = false,
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

  const groupedAttachments = useMemo((): GroupedAttachment[] => {
    const groups: Map<string, GroupedAttachment> = new Map();
    attachments.forEach(att => {
      const group = groups.get(att.file.name);
      if (group) {
        group.attachmentIds.push(att.id);
        if (att.sheetName) {
          group.sheetNames.push(att.sheetName);
        }
        if (att.status === 'error') group.status = 'error';
        if (att.status === 'uploading' && group.status !== 'error') group.status = 'uploading';
      } else {
        groups.set(att.file.name, {
          fileName: att.file.name,
          file: att.file,
          sheetNames: att.sheetName ? [att.sheetName] : [],
          attachmentIds: [att.id],
          status: att.status,
          error: att.error,
        });
      }
    });
    return Array.from(groups.values());
  }, [attachments]);

  const handleDeleteGroup = (attachmentIds: string[]) => {
    attachmentIds.forEach(id => onDeleteAttachment(id));
  };

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

  const defaultPlaceholder = [
    '1. Upload supported formats: Excel, CSV. Max file size: 1GB.',
    '2. Enter your question or analysis instruction.',
    '3. Press Control+Enter to submit.',
  ].join('\n');
  const placeholderText = isInitializing ? 'Vaultmind 引擎初始化中...' : defaultPlaceholder;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative' }}>
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
        <div style={{
          padding: '8px 12px',
          background: 'rgba(255, 255, 255, 0.04)',
          borderRadius: '6px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}>
          <Typography.Text type="secondary" style={{ marginBottom: '8px', display: 'block' }}>Suggestions:</Typography.Text>
          <Space size={[8, 8]} wrap>
            {suggestions.map((s, i) => (
              <Tag key={i} onClick={() => form.setFieldsValue({ message: s })} style={{ cursor: 'pointer' }}>
                {s}
              </Tag>
            ))}
          </Space>
        </div>
      )}

      {/* Attachments Display */}
      {groupedAttachments.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '0 8px' }}>
          {groupedAttachments.map((group) => {
            const tooltipTitle = group.sheetNames.length > 1 ? `Loaded sheets: ${group.sheetNames.join(', ')}` : `Loaded from ${group.fileName}`;
            return (
              <Tooltip title={tooltipTitle} key={group.fileName}>
                <Tag
                  closable
                  onClose={() => handleDeleteGroup(group.attachmentIds)}
                  icon={group.status === 'uploading' ? <Spin size="small" /> : <FileExcelOutlined />}
                  color={group.status === 'error' ? 'error' : 'default'}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'default' }}
                >
                  {group.fileName}
                  {group.status === 'error' && <Tooltip title={group.error}><CloseCircleFilled /></Tooltip>}
                </Tag>
              </Tooltip>
            );
          })}
        </div>
      )}

      <Form form={form} onFinish={handleFinish} layout="vertical">
        <div style={{ position: 'relative' }}>
          <Form.Item name="message" noStyle>
            <Input.TextArea
              placeholder={placeholderText}
              disabled={isAnalyzing || isInitializing}
              style={{ height: 120, resize: 'none', paddingBottom: '40px', paddingRight: '40px' }}
              onKeyDown={handleKeyDown}
              onChange={() => error && setError(null)}
            />
          </Form.Item>
          {/* Transparent overlay during initialization: blocks input but keeps UI visible */}
          {isInitializing && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0)', // transparent
                zIndex: 10,
                cursor: 'not-allowed',
                pointerEvents: 'auto',
              }}
            >
              <Space>
                <Spin size="small" />
                <Typography.Text style={{ color: 'rgba(255,255,255,0.85)' }}>Vaultmind 引擎初始化中...</Typography.Text>
              </Space>
            </div>
          )}
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

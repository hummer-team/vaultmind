import React, { useMemo, useEffect } from 'react';
import { Input, Button, Form, Tag, Space, Upload, FloatButton, Typography, Spin, Tooltip } from 'antd';
import { PaperClipOutlined, DownOutlined, CloseCircleFilled, StopOutlined, FileExcelOutlined, UserOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { Attachment } from '../../../types/workbench.types';
import './ChatPanel.css'; // Import a CSS file for animations
import { getPersonaById } from '../../../config/personas';
import { useUserStore } from '../../../status/appStatusManager.ts';

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
  showPersonaPrompt?: boolean;
  onPersonaSetupClick?: () => void;
  onPersonaPromptDismiss?: () => void;
  onPersonaBadgeClick?: () => void;
  // 新增：用于外部控制输入框内容
  initialMessage?: string;
  setInitialMessage?: (msg: string) => void;
  // new: inline persona hint text
  personaHint?: string | null;
  // new: upload hint text (light yellow), near action buttons
  uploadHint?: string | null;
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
  onPersonaBadgeClick,
  initialMessage,
  setInitialMessage,
  personaHint,
  uploadHint,
}) => {
  const [form] = Form.useForm();
  const { userProfile } = useUserStore();

  // 当 initialMessage 变化时，同步到表单输入框
  useEffect(() => {
    if (initialMessage !== undefined) {
      form.setFieldsValue({ message: initialMessage });
    }
  }, [initialMessage, form]);

  // 当用户手动输入时，如果有 setInitialMessage，则更新上层状态，保持双向同步（可选）
  const handleChangeMessage = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (error) setError(null);
    if (setInitialMessage) setInitialMessage(e.target.value);
  };

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
    if (setInitialMessage) setInitialMessage('');
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
    '1. Upload supported formats: Excel, CSV. Max file size: 200MB.',
    '2. Enter your question or analysis instruction.',
    '3. Press Control+Enter to submit.',
  ].join('\n');
  const placeholderText = isInitializing ? 'Vaultmind 引擎初始化中...' : defaultPlaceholder;

  // Check if user has set a persona (skills[0] exists)
  const hasPersona = !!(userProfile?.skills?.[0]);
  const currentPersonaId = userProfile?.skills?.[0] || 'business_user';
  const currentPersona = getPersonaById(currentPersonaId);

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
              style={{ height: 120, resize: 'none', paddingBottom: '52px', paddingRight: '40px' }}
              onKeyDown={handleKeyDown}
              onChange={handleChangeMessage}
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
          <div
            style={{
              position: 'absolute',
              bottom: '8px',
              left: '8px',
              right: '48px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {/* Enhanced Persona Badge */}
              <Tooltip
                title={
                  hasPersona
                    ? `${currentPersona.displayName} - Expertise: ${currentPersona.expertise.join(', ')}`
                    : '👋 Set your role to get precise analysis suggestions'
                }
                placement="top"
              >
                <Button
                  icon={<UserOutlined />}
                  onClick={onPersonaBadgeClick}
                  className={!hasPersona ? 'persona-button-pulse' : ''}
                  style={{
                    padding: '4px 15px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: !hasPersona ? '2px solid #1890ff' : undefined,
                    boxShadow: !hasPersona ? '0 0 8px rgba(24, 144, 255, 0.5)' : undefined,
                  }}
                >
                  {hasPersona && <span style={{ marginLeft: 4 }}>{currentPersona.displayName}</span>}
                </Button>
              </Tooltip>
              <Upload {...uploadProps}>
                <Button icon={<PaperClipOutlined />} disabled={isAnalyzing} />
              </Upload>
              {uploadHint && (
                <Typography.Text style={{ fontSize: 12, color: '#fadb14' }}>
                  {uploadHint}
                </Typography.Text>
              )}
              {error && (
                <Typography.Text type="danger" style={{ fontSize: '12px' }}>
                  {error}
                </Typography.Text>
              )}
            </div>
            {/* inline hints on the right side */}
            {personaHint && (
              <Typography.Text style={{ fontSize: 12, color: '#fadb14' }}>
                {personaHint}
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

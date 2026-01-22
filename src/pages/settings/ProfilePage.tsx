import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Avatar,
  Select,
  Table,
  Switch,
  Popconfirm,
  Modal,
  App,
  Space,
  Upload,
} from 'antd';
import type { UploadProps } from 'antd';
import { UserOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { settingsService, LLMProviderConfig, LlmConfigConflictError } from '../../services/settingsService.ts';
import { useUserStore } from '../../status/appStatusManager.ts';
import { personaRegistry } from '../../config/personas';
import './ProfilePage.css';


const getBase64 = (img: File, callback: (url: string) => void) => {
  const reader = new FileReader();
  reader.addEventListener('load', () => callback(reader.result as string));
  reader.readAsDataURL(img);
};

const ProfilePage: React.FC = () => {
  const { message } = App.useApp();
  const [profileForm] = Form.useForm();
  const [llmForm] = Form.useForm();

  const { userProfile, setUserProfile } = useUserStore();

  const [llmConfigs, setLlmConfigs] = useState<LLMProviderConfig[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState<LLMProviderConfig | null>(null);

  useEffect(() => {
    if (userProfile) {
      profileForm.setFieldsValue({
        ...userProfile,
        skills: userProfile.skills?.[0] || undefined
      });
    }
  }, [userProfile, profileForm]);

  useEffect(() => {
    const loadLlmConfigs = async () => {
      try {
        const configs = await settingsService.getLlmConfigs();
        setLlmConfigs(configs);
      } catch (error) {
        message.error('Failed to load LLM configurations.');
        console.error('[ProfilePage] Error loading LLM configs:', error);
      }
    };
    loadLlmConfigs();
  }, []);

  const handleProfileUpdate = async (values: any) => {
    if (!userProfile) return;
    try {
      // Convert single skill selection to array format
      const updatedProfile = {
        ...userProfile,
        ...values,
        skills: values.skills ? [values.skills] : []
      };
      await settingsService.saveUserProfile(updatedProfile);

      // ✅ keep global userProfile in sync so Workbench / ChatPanel see latest role
      setUserProfile(updatedProfile);
    } catch (error) {
      message.error('Failed to update profile.');
      console.error('[ProfilePage] Error updating profile:', error);
    }
  };

  const handleShowModal = (config?: LLMProviderConfig) => {
    setEditingConfig(config || null);
    llmForm.setFieldsValue(config || {});
    setIsModalVisible(true);
  };

  const handleLlmConfigSave = async () => {
    if (!userProfile) return;
    try {
      const values = await llmForm.validateFields();
      let updatedConfigs;
      if (editingConfig) {
        updatedConfigs = await settingsService.updateLlmConfig(editingConfig.id, values);
      } else {
        updatedConfigs = await settingsService.addLlmConfig({ ...values, isEnabled: true });
      }
      setLlmConfigs(updatedConfigs);
      setIsModalVisible(false);
    } catch (error) {
      if (error instanceof LlmConfigConflictError) {
        Modal.warning({
          title: 'Only one LLM can be enabled',
          content: 'Please disable the current enabled config first, then enable another one.',
          centered: true,
        });
        return;
      }
      message.error('Failed to save LLM config.');
      console.error('[ProfilePage] Error saving LLM config:', error);
    }
  };

  const handleLlmConfigToggle = async (configId: string, isEnabled: boolean) => {
    try {
      const updatedConfigs = await settingsService.updateLlmConfig(configId, { isEnabled });
      setLlmConfigs(updatedConfigs);
    } catch (error) {
      if (error instanceof LlmConfigConflictError) {
        Modal.warning({
          title: 'Only one LLM can be enabled',
          content: 'Please disable the current enabled config first, then enable another one.',
          centered: true,
        });
        return;
      }
      message.error('Failed to toggle LLM config status.');
    }
  };

  const handleLlmConfigDelete = async (configId: string) => {
    try {
      const updatedConfigs = await settingsService.deleteLlmConfig(configId);
      setLlmConfigs(updatedConfigs);
    } catch (error) {
      message.error('Failed to delete LLM config.');
    }
  };

  const uploadProps: UploadProps = {
    name: 'avatar',
    showUploadList: false,
    beforeUpload: (file) => {
      if (!userProfile) return false;
      const isJpgOrPng = file.type === 'image/jpeg' || file.type === 'image/png';
      if (!isJpgOrPng) {
        message.error('You may only upload images in JPG/PNG format!');
      }
      const isLt200K = file.size / 1024 < 200;
      if (!isLt200K) {
        message.error('Images must be smaller than 200KB!');
      }
      if (isJpgOrPng && isLt200K) {
        getBase64(file, (url) => {
          const updatedProfile = { ...userProfile, avatar: url };
          setUserProfile(updatedProfile);
        });
      }
      return false;
    },
  };

  const columns = [
    { title: 'URL', dataIndex: 'url', key: 'url', ellipsis: true },
    {
      title: 'API Key',
      dataIndex: 'apiKey',
      key: 'apiKey',
      ellipsis: true,
      render: (text: string) => `sk-**********...${text.slice(-4)}`,
    },
    {
      title: 'Status',
      dataIndex: 'isEnabled',
      key: 'isEnabled',
      width: 100, // slightly wider but still compact
      render: (isEnabled: boolean, record: LLMProviderConfig) => (
        <Switch checked={isEnabled} onChange={(checked) => handleLlmConfigToggle(record.id, checked)} />
      ),
    },
    {
      title: 'Action',
      key: 'action',
      width: 170, // compact but enough for两个 link 按钮
      render: (_: any, record: LLMProviderConfig) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleShowModal(record)}
          >
            Edit
          </Button>
          <Popconfirm
            title="Are you sure you want to delete this config?"
            onConfirm={() => handleLlmConfigDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
            >
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Generate persona options with expertise description
  const personaOptions = Object.values(personaRegistry).map(persona => ({
    value: persona.id,
    label: (
      <div>
        <span>{persona.icon} {persona.displayName}</span>
        <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.45)', marginTop: '2px' }}>
          Expertise: {persona.expertise.join('、')}
        </div>
      </div>
    ),
  }));

  // LLM Provider Configurations section is enabled by default.
  const SHOW_LLM_PROVIDER_CONFIGS = true;

  return (
    <div
      className="profile-page"
      style={{
        // Let Drawer body be the only page background to avoid "multi-layer" effect.
        // Keep this container transparent but fully stretched.
        background: 'transparent',
        minHeight: '100%',
        height: '100%',
        padding: '24px',
        maxWidth: '1000px',
        margin: '0 auto',
        borderRadius: 16,
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxSizing: 'border-box',
      }}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card
          styles={{
            body: {
              background: 'rgba(24, 24, 28, 0.98)',
              borderRadius: 12,
            },
          }}
          style={{
            background: 'rgba(24, 24, 28, 0.98)',
            border: '1px solid rgba(255, 255, 255, 0.10)',
          }}
        >
          {userProfile && (
            <Form
              form={profileForm}
              layout="vertical"
              onFinish={handleProfileUpdate}
              initialValues={{
                ...userProfile,
                skills: userProfile.skills?.[0] || undefined
              }}
            >
              <Form.Item label="Avatar" name="avatar">
                <Upload {...uploadProps}>
                  <Avatar size={64} src={userProfile.avatar} icon={<UserOutlined />} style={{ cursor: 'pointer' }} />
                </Upload>
              </Form.Item>
              <Form.Item label="Nickname" name="nickname"><Input /></Form.Item>
              <Form.Item label="Occupation" name="occupation"><Input /></Form.Item>
              <Form.Item
                label="Role"
                name="skills"
                tooltip="Select your primary role for personalized analysis suggestions"
              >
                <Select
                  placeholder="Select your role"
                  options={personaOptions}
                  optionLabelProp="label"
                />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit">Update Profile</Button>
              </Form.Item>
            </Form>
          )}
        </Card>

        {SHOW_LLM_PROVIDER_CONFIGS && (
          <Card
            styles={{
              body: {
                background: 'rgba(24, 24, 28, 0.98)',
                borderRadius: 12,
              },
            }}
            style={{
              background: 'rgba(24, 24, 28, 0.98)',
              border: '1px solid rgba(255, 255, 255, 0.10)',
            }}
          >
            {/* Title removed to reduce visual height and test layout behavior */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => handleShowModal()}>
                Add New Config
              </Button>
              <span style={{ fontSize: 12, color: '#fadb14' }}>
                Tip: You can only enable one LLM config at a time.
              </span>
            </div>
            <div
              className="profile-llm-table-scroller"
              style={{
                background: 'rgba(24, 24, 28, 0.98)',
                borderRadius: 12,
                border: '1px solid rgba(255, 255, 255, 0.08)',
                /* Fixed viewport for table content */
                height: 220,
                overflowY: 'auto',
                overflowX: 'hidden',
              }}
            >
              <Table
                columns={columns}
                dataSource={llmConfigs}
                rowKey="id"
                scroll={{ x: 800 }}
                pagination={false}
                style={{ background: 'rgba(24, 24, 28, 0.98)' }}
                components={{
                  table: (props: React.HTMLAttributes<HTMLTableElement>) => (
                    <table
                      {...props}
                      style={{
                        ...(props.style ?? {}),
                        background: 'rgba(24, 24, 28, 0.98)',
                      }}
                    />
                  ),
                }}
                className="profile-llm-table"
              />
              {/* Pagination / empty area background guard */}
              <div style={{ height: 1, background: 'rgba(24, 24, 28, 0.98)' }} />
            </div>
          </Card>
        )}


      {/* Only render modal when configs section is enabled */}
      {SHOW_LLM_PROVIDER_CONFIGS && (
        <Modal
          title={editingConfig ? 'Edit LLM Config' : 'Add New LLM Config'}
          open={isModalVisible}
          onOk={handleLlmConfigSave}
          onCancel={() => setIsModalVisible(false)}
          destroyOnClose
          modalRender={(modal) => (
            <div
              style={{
                background: 'rgba(24, 24, 28, 0.98)',
                border: '1px solid rgba(255, 255, 255, 0.10)',
                borderRadius: 8,
              }}
            >
              {modal}
            </div>
          )}
        >
          <Form form={llmForm} layout="vertical" name="llm_config_form">
            <Form.Item name="url" label="URL" rules={[{ required: true, message: 'Please input the API URL!' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="apiKey" label="API Key" rules={[{ required: true, message: 'Please input the API Key!' }]}>
              <Input.Password placeholder="Enter your API Key" />
            </Form.Item>
          </Form>
        </Modal>
      )}
      </Space>
    </div>
  );
};

export default ProfilePage;

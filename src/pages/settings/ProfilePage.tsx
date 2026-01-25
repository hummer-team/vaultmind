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
  Typography,
  Alert,
  Collapse,
  List,
  Tag,
  Radio,
  InputNumber,
} from 'antd';
import type { UploadProps } from 'antd';
import { UserOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { settingsService, LLMProviderConfig, LlmConfigConflictError } from '../../services/settingsService.ts';
import { useUserStore } from '../../status/appStatusManager.ts';
import { personaRegistry } from '../../config/personas';
import { userSkillService } from '../../services/userSkill/userSkillService.ts';
import type { UserSkillConfig, TableSkillConfig, FieldMapping, FilterExpr, RelativeTimeValue, LiteralValue, MetricDefinition } from '../../services/llm/skills/types.ts';
import './ProfilePage.css';

const { Panel } = Collapse;

// M10.5 Phase 4: System Metrics definitions by industry
interface SystemMetric {
  key: string;
  label: string;
  formula: string;
}

const getSystemMetrics = (industry?: string): SystemMetric[] => {
  // Default metrics for all industries
  const defaultMetrics: SystemMetric[] = [
    { key: 'total_count', label: 'Total Count', formula: 'COUNT(*)' },
    { key: 'unique_count', label: 'Unique Count', formula: 'COUNT(DISTINCT <column>)' },
  ];

  // Industry-specific metrics
  if (industry === 'ecommerce') {
    return [
      { key: 'gmv', label: 'Gross Merchandise Value', formula: 'SUM(amount)' },
      { key: 'order_count', label: 'Order Count', formula: 'COUNT(*)' },
      { key: 'avg_order_value', label: 'Average Order Value', formula: 'AVG(amount)' },
      { key: 'unique_users', label: 'Unique Users', formula: 'COUNT(DISTINCT user_id)' },
      { key: 'paid_order_count', label: 'Paid Order Count', formula: 'COUNT(*) WHERE status = \'paid\'' },
      { key: 'conversion_rate', label: 'Conversion Rate', formula: '(paid_orders / total_orders) * 100' },
    ];
  }

  if (industry === 'finance') {
    return [
      { key: 'total_amount', label: 'Total Amount', formula: 'SUM(amount)' },
      { key: 'transaction_count', label: 'Transaction Count', formula: 'COUNT(*)' },
      { key: 'avg_transaction', label: 'Average Transaction', formula: 'AVG(amount)' },
      { key: 'unique_accounts', label: 'Unique Accounts', formula: 'COUNT(DISTINCT account_id)' },
    ];
  }

  if (industry === 'retail') {
    return [
      { key: 'total_sales', label: 'Total Sales', formula: 'SUM(amount)' },
      { key: 'transaction_count', label: 'Transaction Count', formula: 'COUNT(*)' },
      { key: 'avg_basket_size', label: 'Average Basket Size', formula: 'AVG(amount)' },
      { key: 'unique_customers', label: 'Unique Customers', formula: 'COUNT(DISTINCT customer_id)' },
    ];
  }

  return defaultMetrics;
};

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

  // User Skill Configuration states
  const [userSkillConfig, setUserSkillConfig] = useState<UserSkillConfig | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [availableTables, setAvailableTables] = useState<string[]>([]);
  const [currentTableConfig, setCurrentTableConfig] = useState<TableSkillConfig | null>(null);
  const [isSkillModalVisible, setIsSkillModalVisible] = useState(false);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  
  // Filter editing states
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [editingFilterIndex, setEditingFilterIndex] = useState<number | null>(null);
  const [filterForm] = Form.useForm();
  
  // Metric editing states
  const [isMetricModalVisible, setIsMetricModalVisible] = useState(false);
  const [editingMetricKey, setEditingMetricKey] = useState<string | null>(null);
  const [metricForm] = Form.useForm();

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

  // Load User Skill Configuration
  useEffect(() => {
    const loadUserSkillConfig = async () => {
      try {
        const config = await userSkillService.loadUserSkill();
        setUserSkillConfig(config);
        console.log('[ProfilePage] User Skill config loaded:', config);
      } catch (error) {
        console.error('[ProfilePage] Error loading user skill config:', error);
      }
    };
    loadUserSkillConfig();
  }, []);

  // Load available tables from session storage (or mock data)
  useEffect(() => {
    // Try to get schema cache from session storage
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      chrome.storage.session.get(['schemaCache'], (result) => {
        if (result.schemaCache && typeof result.schemaCache === 'object') {
          const tables = Object.keys(result.schemaCache);
          setAvailableTables(tables);
          console.log('[ProfilePage] Available tables from session:', tables);
        } else {
          // No schema cache - use mock data for development
          console.log('[ProfilePage] No schema cache found, using mock data');
          setAvailableTables(['orders_table', 'users_table']); // Mock tables
        }
      });
    } else {
      // Development fallback
      setAvailableTables(['orders_table', 'users_table']);
    }
  }, []);

  // Handle table selection
  const handleTableSelect = (tableName: string) => {
    setSelectedTable(tableName);
    
    // Load existing config for this table if available
    if (userSkillConfig?.tables[tableName]) {
      setCurrentTableConfig(userSkillConfig.tables[tableName]);
      console.log('[ProfilePage] Loaded config for table:', tableName, userSkillConfig.tables[tableName]);
    } else {
      setCurrentTableConfig(null);
      console.log('[ProfilePage] No existing config for table:', tableName);
    }
  };

  // Load table columns from schema cache
  useEffect(() => {
    if (!selectedTable) {
      setAvailableColumns([]);
      return;
    }

    const loadColumns = async () => {
      try {
        // Try to read from chrome.storage.session (schemaCache)
        if (typeof chrome !== 'undefined' && chrome.storage?.session) {
          const result = await chrome.storage.session.get('schemaCache');
          const schemaCache = result.schemaCache as Record<string, Array<{ name: string }>> || {};
          
          if (schemaCache[selectedTable]) {
            const columns = schemaCache[selectedTable].map((col: { name: string }) => col.name);
            setAvailableColumns(columns);
            console.log('[ProfilePage] Loaded columns from schema cache:', columns);
            return;
          }
        }
        
        // Fallback to mock data for development
        setAvailableColumns(['order_id', 'user_id', 'order_time', 'amount', 'status', 'product_name']);
        console.log('[ProfilePage] Using mock columns for development');
      } catch (error) {
        console.warn('[ProfilePage] Failed to load schema cache, using mock columns:', error);
        setAvailableColumns(['order_id', 'user_id', 'order_time', 'amount', 'status', 'product_name']);
      }
    };

    loadColumns();
  }, [selectedTable]);

  // Handle industry change
  const handleIndustryChange = (value: string) => {
    if (!selectedTable) return;
    setCurrentTableConfig(prev => prev ? { ...prev, industry: value } : { industry: value });
  };

  // Handle field mapping change
  const handleFieldMappingChange = (field: keyof FieldMapping, value: string | undefined) => {
    if (!selectedTable) return;
    setCurrentTableConfig(prev => {
      if (!prev) return { industry: 'ecommerce', fieldMapping: { [field]: value } };
      return {
        ...prev,
        fieldMapping: {
          ...prev.fieldMapping,
          [field]: value
        }
      };
    });
  };

  // Handle time shortcut selection
  const handleTimeShortcutChange = (value: string | null) => {
    if (!selectedTable || !value) return;
    
    const shortcuts: Record<string, RelativeTimeValue> = {
      '7d': { kind: 'relative_time', unit: 'day', amount: 7, direction: 'past' },
      '30d': { kind: 'relative_time', unit: 'day', amount: 30, direction: 'past' },
      '90d': { kind: 'relative_time', unit: 'day', amount: 90, direction: 'past' },
    };

    if (shortcuts[value] && currentTableConfig?.fieldMapping?.timeColumn) {
      const timeFilter: FilterExpr = {
        column: currentTableConfig.fieldMapping.timeColumn,
        op: '>=',
        value: shortcuts[value]
      };
      
      setCurrentTableConfig(prev => {
        if (!prev) return { industry: 'ecommerce', defaultFilters: [timeFilter] };
        // Replace existing time filter or add new one
        const existingFilters = prev.defaultFilters || [];
        const nonTimeFilters = existingFilters.filter(f => f.column !== timeFilter.column || typeof f.value !== 'object' || (f.value as any).kind !== 'relative_time');
        return {
          ...prev,
          defaultFilters: [...nonTimeFilters, timeFilter]
        };
      });
    }
  };

  // Open filter add/edit modal
  const handleAddFilter = () => {
    filterForm.resetFields();
    setEditingFilterIndex(null);
    setIsFilterModalVisible(true);
  };

  const handleEditFilter = (index: number) => {
    const filter = currentTableConfig?.defaultFilters?.[index];
    if (!filter) return;
    
    // Prepare form values based on filter type
    const isRelativeTime = typeof filter.value === 'object' && 'kind' in filter.value;
    
    if (isRelativeTime) {
      const rtValue = filter.value as RelativeTimeValue;
      filterForm.setFieldsValue({
        column: filter.column,
        op: filter.op,
        valueType: 'relative_time',
        timeUnit: rtValue.unit,
        timeAmount: rtValue.amount,
        timeDirection: rtValue.direction
      });
    } else {
      filterForm.setFieldsValue({
        column: filter.column,
        op: filter.op,
        valueType: 'literal',
        literalValue: Array.isArray(filter.value) ? filter.value.join(', ') : filter.value
      });
    }
    
    setEditingFilterIndex(index);
    setIsFilterModalVisible(true);
  };

  const handleDeleteFilter = (index: number) => {
    setCurrentTableConfig(prev => {
      if (!prev) return prev;
      const filters = [...(prev.defaultFilters || [])];
      filters.splice(index, 1);
      return { ...prev, defaultFilters: filters };
    });
  };

  // Save filter from modal
  const handleSaveFilter = async () => {
    try {
      const values = await filterForm.validateFields();
      
      let filterValue: LiteralValue | RelativeTimeValue;
      
      if (values.valueType === 'relative_time') {
        filterValue = {
          kind: 'relative_time',
          unit: values.timeUnit,
          amount: values.timeAmount,
          direction: values.timeDirection
        };
      } else {
        // Handle literal values
        if (values.op === 'in' || values.op === 'not_in') {
          // Parse comma-separated values
          filterValue = values.literalValue.split(',').map((v: string) => v.trim());
        } else {
          filterValue = values.literalValue;
        }
      }
      
      const newFilter: FilterExpr = {
        column: values.column,
        op: values.op,
        value: filterValue
      };
      
      setCurrentTableConfig(prev => {
        if (!prev) return { industry: 'ecommerce', defaultFilters: [newFilter] };
        
        const filters = [...(prev.defaultFilters || [])];
        if (editingFilterIndex !== null) {
          filters[editingFilterIndex] = newFilter;
        } else {
          filters.push(newFilter);
        }
        
        return { ...prev, defaultFilters: filters };
      });
      
      setIsFilterModalVisible(false);
      filterForm.resetFields();
    } catch (error) {
      console.error('[ProfilePage] Filter validation failed:', error);
    }
  };

  // Metric CRUD handlers
  const handleAddMetric = () => {
    metricForm.resetFields();
    setEditingMetricKey(null);
    setIsMetricModalVisible(true);
  };

  const handleEditMetric = (metricKey: string) => {
    const metric = currentTableConfig?.metrics?.[metricKey];
    if (!metric) return;
    
    metricForm.setFieldsValue({
      metricKey,
      label: metric.label,
      aggregation: metric.aggregation,
      column: metric.column,
    });
    
    setEditingMetricKey(metricKey);
    setIsMetricModalVisible(true);
  };

  const handleDeleteMetric = (metricKey: string) => {
    setCurrentTableConfig(prev => {
      if (!prev) return prev;
      const metrics = { ...(prev.metrics || {}) };
      delete metrics[metricKey];
      return { ...prev, metrics };
    });
  };

  const handleSaveMetric = async () => {
    try {
      const values = await metricForm.validateFields();
      
      const newMetric: MetricDefinition = {
        label: values.label,
        aggregation: values.aggregation,
        column: values.column,
      };
      
      // Use provided key or generate from label
      const metricKey = editingMetricKey || values.metricKey || values.label.toLowerCase().replace(/\s+/g, '_');
      
      setCurrentTableConfig(prev => {
        if (!prev) return { industry: 'ecommerce', metrics: { [metricKey]: newMetric } };
        
        return {
          ...prev,
          metrics: {
            ...(prev.metrics || {}),
            [metricKey]: newMetric
          }
        };
      });
      
      setIsMetricModalVisible(false);
      metricForm.resetFields();
    } catch (error) {
      console.error('[ProfilePage] Metric validation failed:', error);
    }
  };

  // Storage Integration handlers
  const handleSaveConfiguration = async () => {
    if (!selectedTable || !currentTableConfig) {
      message.warning('Please configure at least the industry field');
      return;
    }

    // Validate that industry is set
    if (!currentTableConfig.industry) {
      message.error('Industry is required');
      return;
    }

    try {
      // Update or create table configuration
      await userSkillService.updateTableSkill(selectedTable, currentTableConfig);
      
      // Reload the full config to sync state
      const updatedConfig = await userSkillService.loadUserSkill();
      setUserSkillConfig(updatedConfig);
      
      message.success(`Configuration saved for table: ${selectedTable}`);
      console.log('[ProfilePage] Saved configuration:', currentTableConfig);
    } catch (error) {
      message.error('Failed to save configuration. Check console for details.');
      console.error('[ProfilePage] Save configuration error:', error);
    }
  };

  const handleResetConfiguration = async () => {
    if (!selectedTable) return;

    try {
      await userSkillService.resetToDefault(selectedTable);
      
      // Reload config
      const updatedConfig = await userSkillService.loadUserSkill();
      setUserSkillConfig(updatedConfig);
      setCurrentTableConfig(null);
      
      message.success(`Configuration reset for table: ${selectedTable}`);
      console.log('[ProfilePage] Reset configuration for table:', selectedTable);
    } catch (error) {
      message.error('Failed to reset configuration');
      console.error('[ProfilePage] Reset configuration error:', error);
    }
  };

  const handleResetAllConfigurations = async () => {
    try {
      await userSkillService.resetToDefault();
      
      // Reload config
      const updatedConfig = await userSkillService.loadUserSkill();
      setUserSkillConfig(updatedConfig);
      setCurrentTableConfig(null);
      setSelectedTable(null);
      
      message.success('All configurations reset');
      console.log('[ProfilePage] Reset all configurations');
    } catch (error) {
      message.error('Failed to reset all configurations');
      console.error('[ProfilePage] Reset all error:', error);
    }
  };

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

              {/* User Skill Configuration Button */}
              <Form.Item label="User Skill Configuration">
                <Button
                  type="default"
                  onClick={() => setIsSkillModalVisible(true)}
                  block
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <EditOutlined />
                  Configure User Skills
                  {userSkillConfig && Object.keys(userSkillConfig.tables).length > 0 && (
                    <span style={{ color: '#52c41a', marginLeft: '4px' }}>
                      ({Object.keys(userSkillConfig.tables).length} table{Object.keys(userSkillConfig.tables).length > 1 ? 's' : ''} configured)
                    </span>
                  )}
                </Button>
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

      {/* User Skill Configuration Modal */}
      <Modal
        title="User Skill Configuration"
        open={isSkillModalVisible}
        onCancel={() => setIsSkillModalVisible(false)}
        footer={null}
        width={800}
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
        <div style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: '8px' }}>
          {/* Table Selection */}
          <Form.Item
            label="Select Table"
            tooltip="Choose a table to configure domain-specific settings"
            style={{ marginBottom: 16 }}
          >
            <Select
              placeholder="Choose a table to configure"
              value={selectedTable}
              onChange={handleTableSelect}
              options={availableTables.map(t => ({ label: t, value: t }))}
              disabled={availableTables.length === 0}
              allowClear
              onClear={() => setSelectedTable(null)}
            />
          </Form.Item>

          {availableTables.length === 0 && (
            <Alert
              message="No tables available"
              description="Please upload a data file in the Workbench to configure User Skills."
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          {selectedTable && (
            <div>
              <Alert
                message={`Configuring: ${selectedTable}`}
                description={
                  currentTableConfig
                    ? `Industry: ${currentTableConfig.industry || 'Not set'} - Expand panels below to edit`
                    : 'No configuration yet - Set industry and field mapping below'
                }
                type={currentTableConfig ? 'success' : 'info'}
                showIcon
                style={{ marginBottom: 16 }}
              />

              <Collapse
                defaultActiveKey={['industry']}
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <Panel header="Industry & Field Mapping" key="industry">
                  <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    {/* Industry Selection */}
                    <Form.Item
                      label="Industry"
                      tooltip="Business domain - determines available metrics and terminology"
                      required
                      style={{ marginBottom: 8 }}
                    >
                      <Select
                        placeholder="Select your industry"
                        value={currentTableConfig?.industry}
                        onChange={handleIndustryChange}
                        options={[
                          { label: 'E-commerce', value: 'ecommerce' },
                          { label: 'Finance', value: 'finance' },
                          { label: 'Retail', value: 'retail' },
                          { label: 'Custom', value: 'custom' }
                        ]}
                        style={{ width: '100%' }}
                      />
                    </Form.Item>

                    <Typography.Title level={5} style={{ marginTop: 8, marginBottom: 8 }}>
                      Field Mapping (Optional)
                    </Typography.Title>
                    <Typography.Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: 12 }}>
                      Map your table columns to standard fields for better analysis
                    </Typography.Text>

                    {/* Order ID Column */}
                    <Form.Item
                      label="Order ID Column"
                      tooltip="Column containing unique order identifiers"
                      style={{ marginBottom: 8 }}
                    >
                      <Select
                        placeholder="Select order ID column"
                        value={currentTableConfig?.fieldMapping?.orderIdColumn}
                        onChange={(value) => handleFieldMappingChange('orderIdColumn', value)}
                        options={availableColumns.map(col => ({ label: col, value: col }))}
                        allowClear
                        disabled={availableColumns.length === 0}
                        style={{ width: '100%' }}
                      />
                    </Form.Item>

                    {/* User ID Column */}
                    <Form.Item
                      label="User ID Column"
                      tooltip="Column containing user/customer identifiers"
                      style={{ marginBottom: 8 }}
                    >
                      <Select
                        placeholder="Select user ID column"
                        value={currentTableConfig?.fieldMapping?.userIdColumn}
                        onChange={(value) => handleFieldMappingChange('userIdColumn', value)}
                        options={availableColumns.map(col => ({ label: col, value: col }))}
                        allowClear
                        disabled={availableColumns.length === 0}
                        style={{ width: '100%' }}
                      />
                    </Form.Item>

                    {/* Time Column */}
                    <Form.Item
                      label="Time Column"
                      tooltip="Column containing timestamp for time-based analysis"
                      style={{ marginBottom: 8 }}
                    >
                      <Select
                        placeholder="Select time column"
                        value={currentTableConfig?.fieldMapping?.timeColumn}
                        onChange={(value) => handleFieldMappingChange('timeColumn', value)}
                        options={availableColumns.map(col => ({ label: col, value: col }))}
                        allowClear
                        disabled={availableColumns.length === 0}
                        style={{ width: '100%' }}
                      />
                    </Form.Item>

                    {/* Amount Column */}
                    <Form.Item
                      label="Amount Column"
                      tooltip="Column containing monetary amounts or values"
                      style={{ marginBottom: 8 }}
                    >
                      <Select
                        placeholder="Select amount column"
                        value={currentTableConfig?.fieldMapping?.amountColumn}
                        onChange={(value) => handleFieldMappingChange('amountColumn', value)}
                        options={availableColumns.map(col => ({ label: col, value: col }))}
                        allowClear
                        disabled={availableColumns.length === 0}
                        style={{ width: '100%' }}
                      />
                    </Form.Item>

                    {availableColumns.length === 0 && (
                      <Alert
                        message="No columns available"
                        description="Upload data for this table to enable field mapping"
                        type="warning"
                        showIcon
                        style={{ marginTop: 8 }}
                      />
                    )}
                  </Space>
                </Panel>
                <Panel header="Default Filters" key="filters">
                  <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    {/* Time Shortcut Selector */}
                    {currentTableConfig?.fieldMapping?.timeColumn && (
                      <div>
                        <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
                          Time Range Shortcut
                        </Typography.Text>
                        <Select
                          placeholder="Select a time range"
                          onChange={handleTimeShortcutChange}
                          options={[
                            { label: 'Last 7 days', value: '7d' },
                            { label: 'Last 30 days', value: '30d' },
                            { label: 'Last 90 days', value: '90d' },
                          ]}
                          style={{ width: '100%' }}
                          allowClear
                        />
                        <Typography.Text type="secondary" style={{ fontSize: '12px', display: 'block', marginTop: 4 }}>
                          Quick filter on "{currentTableConfig.fieldMapping.timeColumn}" column
                        </Typography.Text>
                      </div>
                    )}

                    {/* Custom Filters List */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Typography.Text strong>Custom Filters</Typography.Text>
                        <Button
                          type="primary"
                          size="small"
                          icon={<PlusOutlined />}
                          onClick={handleAddFilter}
                          disabled={availableColumns.length === 0}
                        >
                          Add Filter
                        </Button>
                      </div>

                      {currentTableConfig?.defaultFilters && currentTableConfig.defaultFilters.length > 0 ? (
                        <List
                          size="small"
                          bordered
                          dataSource={currentTableConfig.defaultFilters}
                          renderItem={(filter, index) => {
                            const isRelativeTime = typeof filter.value === 'object' && 'kind' in filter.value;
                            let displayValue = '';
                            
                            if (isRelativeTime) {
                              const rtValue = filter.value as RelativeTimeValue;
                              displayValue = `${rtValue.direction === 'past' ? 'last' : 'next'} ${rtValue.amount} ${rtValue.unit}${rtValue.amount > 1 ? 's' : ''}`;
                            } else if (Array.isArray(filter.value)) {
                              displayValue = filter.value.join(', ');
                            } else {
                              displayValue = String(filter.value);
                            }
                            
                            return (
                              <List.Item
                                actions={[
                                  <Button
                                    type="link"
                                    size="small"
                                    icon={<EditOutlined />}
                                    onClick={() => handleEditFilter(index)}
                                  />,
                                  <Popconfirm
                                    title="Delete this filter?"
                                    onConfirm={() => handleDeleteFilter(index)}
                                    okText="Yes"
                                    cancelText="No"
                                  >
                                    <Button
                                      type="link"
                                      size="small"
                                      danger
                                      icon={<DeleteOutlined />}
                                    />
                                  </Popconfirm>
                                ]}
                              >
                                <Space size="small">
                                  <Tag color="blue">{filter.column}</Tag>
                                  <Typography.Text code>{filter.op}</Typography.Text>
                                  <Tag color={isRelativeTime ? 'green' : 'default'}>
                                    {displayValue}
                                  </Tag>
                                </Space>
                              </List.Item>
                            );
                          }}
                          style={{ background: 'rgba(255, 255, 255, 0.02)' }}
                        />
                      ) : (
                        <Alert
                          message="No filters configured"
                          description="Add filters to automatically apply constraints to your queries"
                          type="info"
                          showIcon
                        />
                      )}
                    </div>

                    {availableColumns.length === 0 && (
                      <Alert
                        message="No columns available"
                        description="Upload data for this table to enable filter configuration"
                        type="warning"
                        showIcon
                      />
                    )}
                  </Space>
                </Panel>
                <Panel header="Metrics" key="metrics">
                  <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    {/* M10.5 Phase 4: System Metrics Display */}
                    <div>
                      <Typography.Text strong style={{ marginBottom: 8, display: 'block' }}>
                        系统内置指标 (System Metrics)
                      </Typography.Text>
                      <Alert
                        message="只读"
                        description="以下为系统根据行业提供的标准指标，可在下方添加自定义指标覆盖"
                        type="info"
                        showIcon
                        style={{ marginBottom: 12 }}
                      />
                      <List
                        size="small"
                        bordered
                        dataSource={getSystemMetrics(currentTableConfig?.industry)}
                        renderItem={(metric) => {
                          // Check if user has overridden this metric
                          const isOverridden = currentTableConfig?.metrics?.[metric.key] !== undefined;
                          
                          return (
                            <List.Item>
                              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                                <Space size="small">
                                  <Tag color="cyan">{metric.key}</Tag>
                                  <Typography.Text>{metric.label}</Typography.Text>
                                  {isOverridden && (
                                    <Tag color="orange">用户覆盖</Tag>
                                  )}
                                </Space>
                                <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                                  {metric.formula}
                                </Typography.Text>
                              </Space>
                            </List.Item>
                          );
                        }}
                        style={{ background: 'rgba(255, 255, 255, 0.02)' }}
                      />
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Typography.Text strong>Custom Metrics (L0)</Typography.Text>
                        <Button
                          type="primary"
                          size="small"
                          icon={<PlusOutlined />}
                          onClick={handleAddMetric}
                          disabled={availableColumns.length === 0}
                        >
                          Add Metric
                        </Button>
                      </div>
                      
                      <Alert
                        message="L0 Aggregations Only"
                        description="Only basic aggregations are supported: count, count_distinct, sum, avg"
                        type="info"
                        showIcon
                        style={{ marginBottom: 12 }}
                      />

                      {currentTableConfig?.metrics && Object.keys(currentTableConfig.metrics).length > 0 ? (
                        <List
                          size="small"
                          bordered
                          dataSource={Object.entries(currentTableConfig.metrics)}
                          renderItem={([key, metric]) => {
                            return (
                              <List.Item
                                actions={[
                                  <Button
                                    type="link"
                                    size="small"
                                    icon={<EditOutlined />}
                                    onClick={() => handleEditMetric(key)}
                                  />,
                                  <Popconfirm
                                    title="Delete this metric?"
                                    onConfirm={() => handleDeleteMetric(key)}
                                    okText="Yes"
                                    cancelText="No"
                                  >
                                    <Button
                                      type="link"
                                      size="small"
                                      danger
                                      icon={<DeleteOutlined />}
                                    />
                                  </Popconfirm>
                                ]}
                              >
                                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                                  <Space size="small">
                                    <Tag color="purple">{key}</Tag>
                                    <Typography.Text strong>{metric.label}</Typography.Text>
                                  </Space>
                                  <Space size="small">
                                    <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                                      Aggregation:
                                    </Typography.Text>
                                    <Tag color="blue">{metric.aggregation.toUpperCase()}</Tag>
                                    {metric.column && (
                                      <>
                                        <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                                          Column:
                                        </Typography.Text>
                                        <Tag>{metric.column}</Tag>
                                      </>
                                    )}
                                  </Space>
                                  {metric.where && metric.where.length > 0 && (
                                    <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                                      {metric.where.length} filter(s) applied
                                    </Typography.Text>
                                  )}
                                </Space>
                              </List.Item>
                            );
                          }}
                          style={{ background: 'rgba(255, 255, 255, 0.02)' }}
                        />
                      ) : (
                        <Alert
                          message="No metrics configured"
                          description="Add custom metrics to enable domain-specific calculations"
                          type="info"
                          showIcon
                        />
                      )}
                    </div>

                    {availableColumns.length === 0 && (
                      <Alert
                        message="No columns available"
                        description="Upload data for this table to enable metric configuration"
                        type="warning"
                        showIcon
                      />
                    )}
                  </Space>
                </Panel>
              </Collapse>

              <div style={{ marginTop: 16, display: 'flex', gap: '8px', justifyContent: 'space-between' }}>
                <div>
                  <Popconfirm
                    title="Reset this table's configuration?"
                    description="This will clear all settings for this table"
                    onConfirm={handleResetConfiguration}
                    okText="Yes"
                    cancelText="No"
                  >
                    <Button danger>
                      Reset Table
                    </Button>
                  </Popconfirm>
                  
                  <Popconfirm
                    title="Reset all configurations?"
                    description="This will clear settings for ALL tables"
                    onConfirm={handleResetAllConfigurations}
                    okText="Yes"
                    cancelText="No"
                  >
                    <Button danger style={{ marginLeft: 8 }}>
                      Reset All
                    </Button>
                  </Popconfirm>
                </div>
                
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button onClick={() => setIsSkillModalVisible(false)}>
                    Cancel
                  </Button>
                  <Button 
                    type="primary"
                    onClick={handleSaveConfiguration}
                    disabled={!currentTableConfig?.industry}
                  >
                    Save Configuration
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Filter Add/Edit Modal */}
      <Modal
        title={editingFilterIndex !== null ? 'Edit Filter' : 'Add Filter'}
        open={isFilterModalVisible}
        onOk={handleSaveFilter}
        onCancel={() => {
          setIsFilterModalVisible(false);
          filterForm.resetFields();
        }}
        width={600}
        destroyOnClose
      >
        <Form
          form={filterForm}
          layout="vertical"
          initialValues={{ valueType: 'literal', op: '=', timeDirection: 'past', timeUnit: 'day' }}
        >
          <Form.Item
            name="column"
            label="Column"
            rules={[{ required: true, message: 'Please select a column' }]}
          >
            <Select
              placeholder="Select column"
              options={availableColumns.map(col => ({ label: col, value: col }))}
            />
          </Form.Item>

          <Form.Item
            name="op"
            label="Operator"
            rules={[{ required: true, message: 'Please select an operator' }]}
          >
            <Select
              placeholder="Select operator"
              options={[
                { label: '= (equals)', value: '=' },
                { label: '!= (not equals)', value: '!=' },
                { label: '> (greater than)', value: '>' },
                { label: '>= (greater than or equal)', value: '>=' },
                { label: '< (less than)', value: '<' },
                { label: '<= (less than or equal)', value: '<=' },
                { label: 'IN (in list)', value: 'in' },
                { label: 'NOT IN (not in list)', value: 'not_in' },
                { label: 'CONTAINS (contains text)', value: 'contains' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="valueType"
            label="Value Type"
            rules={[{ required: true }]}
          >
            <Radio.Group>
              <Radio value="literal">Literal Value</Radio>
              <Radio value="relative_time">Relative Time</Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.valueType !== curr.valueType}>
            {({ getFieldValue }) => {
              const valueType = getFieldValue('valueType');
              
              if (valueType === 'relative_time') {
                return (
                  <>
                    <Form.Item
                      name="timeDirection"
                      label="Direction"
                      rules={[{ required: true }]}
                    >
                      <Radio.Group>
                        <Radio value="past">Past</Radio>
                        <Radio value="future">Future</Radio>
                      </Radio.Group>
                    </Form.Item>
                    
                    <Space>
                      <Form.Item
                        name="timeAmount"
                        label="Amount"
                        rules={[
                          { required: true, message: 'Please enter amount' },
                          { type: 'number', min: 1, max: 999, message: 'Amount must be 1-999' }
                        ]}
                      >
                        <InputNumber min={1} max={999} placeholder="e.g., 30" style={{ width: 120 }} />
                      </Form.Item>
                      
                      <Form.Item
                        name="timeUnit"
                        label="Unit"
                        rules={[{ required: true }]}
                      >
                        <Select style={{ width: 120 }}>
                          <Select.Option value="day">Day(s)</Select.Option>
                          <Select.Option value="week">Week(s)</Select.Option>
                          <Select.Option value="month">Month(s)</Select.Option>
                          <Select.Option value="year">Year(s)</Select.Option>
                        </Select>
                      </Form.Item>
                    </Space>
                  </>
                );
              } else {
                const op = getFieldValue('op');
                const isArrayOp = op === 'in' || op === 'not_in';
                
                return (
                  <Form.Item
                    name="literalValue"
                    label="Value"
                    rules={[{ required: true, message: 'Please enter a value' }]}
                    tooltip={isArrayOp ? 'Enter comma-separated values for IN/NOT IN operators' : undefined}
                  >
                    <Input
                      placeholder={isArrayOp ? 'e.g., value1, value2, value3' : 'Enter value'}
                    />
                  </Form.Item>
                );
              }
            }}
          </Form.Item>
        </Form>
      </Modal>

      {/* Metric Add/Edit Modal */}
      <Modal
        title={editingMetricKey ? 'Edit Metric' : 'Add Metric'}
        open={isMetricModalVisible}
        onOk={handleSaveMetric}
        onCancel={() => {
          setIsMetricModalVisible(false);
          metricForm.resetFields();
        }}
        width={600}
        destroyOnClose
      >
        <Form
          form={metricForm}
          layout="vertical"
          initialValues={{ aggregation: 'count' }}
        >
          <Form.Item
            name="metricKey"
            label="Metric Key"
            tooltip="Unique identifier for this metric (e.g., gmv, active_users)"
            rules={[
              { required: true, message: 'Please enter a metric key' },
              { pattern: /^[a-z][a-z0-9_]*$/, message: 'Key must start with lowercase letter, use only lowercase, numbers, and underscores' }
            ]}
          >
            <Input
              placeholder="e.g., gmv, active_users"
              disabled={!!editingMetricKey}
            />
          </Form.Item>

          <Form.Item
            name="label"
            label="Label"
            tooltip="Display name for this metric"
            rules={[{ required: true, message: 'Please enter a label' }]}
          >
            <Input placeholder="e.g., Gross Merchandise Value" />
          </Form.Item>

          <Form.Item
            name="aggregation"
            label="Aggregation"
            rules={[{ required: true, message: 'Please select an aggregation' }]}
            tooltip="L0 aggregations only: count, count_distinct, sum, avg"
          >
            <Select
              placeholder="Select aggregation type"
              options={[
                { label: 'COUNT - Count all rows', value: 'count' },
                { label: 'COUNT DISTINCT - Count unique values', value: 'count_distinct' },
                { label: 'SUM - Sum numeric values', value: 'sum' },
                { label: 'AVG - Average of values', value: 'avg' },
              ]}
            />
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.aggregation !== curr.aggregation}>
            {({ getFieldValue }) => {
              const aggregation = getFieldValue('aggregation');
              
              // Column is optional for 'count', required for others
              if (aggregation === 'count') {
                return (
                  <Alert
                    message="COUNT aggregation does not require a column"
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                  />
                );
              }
              
              return (
                <Form.Item
                  name="column"
                  label="Column"
                  rules={[{ required: true, message: 'Please select a column' }]}
                  tooltip="Column to aggregate (required for count_distinct, sum, avg)"
                >
                  <Select
                    placeholder="Select column"
                    options={availableColumns.map(col => ({ label: col, value: col }))}
                  />
                </Form.Item>
              );
            }}
          </Form.Item>

          <Alert
            message="WHERE clause support coming soon"
            description="Currently, metrics do not support WHERE filters in this UI. This will be added in a future update."
            type="warning"
            showIcon
          />
        </Form>
      </Modal>
      </Space>
    </div>
  );
};

export default ProfilePage;

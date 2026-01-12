import React, { useState } from 'react';
import { Card, Button, Typography, List, Segmented, Badge, Divider, Space } from 'antd';
import { CheckCircleTwoTone, CrownFilled } from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

const SubscriptionPage: React.FC = () => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annually'>('monthly');

  const plans = {
    basic: {
      monthly: 29,
      annually: 278, // $23.16/mo
      features: [
        '单个文件分析',
        '基础聚类统计',
        '单个文件多Sheet统计',
      ],
    },
    pro: {
      monthly: 79,
      annually: 758, // $63.16/mo
      features: [
        '包含基础版所有功能',
        '支持多个文件同时上传分析',
        '跨文件、跨 Sheet 联合统计',
        '高级行业数据分析 (多指标归纳, 漏斗分析, 归因分析)',
        '基于历史数据的趋势预测分析',
        '高级数据可视化图表生成',
      ],
    },
  };

  return (
    <div style={{ padding: '24px', maxWidth: '960px', margin: '0 auto' }}>
      {/* 1. Hero Section */}
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <Title level={1}>释放您数据的全部潜力</Title>
        <Paragraph type="secondary" style={{ fontSize: '18px' }}>
          选择最适合您的计划，从今天开始，将复杂数据转化为清晰洞见。
        </Paragraph>
      </div>

      {/* 2. Billing Cycle Toggle */}
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <Segmented
          options={[
            { label: '月度订阅', value: 'monthly' },
            { label: <Badge dot color="green" text="年度订阅 (立省 20%)" />, value: 'annually' },
          ]}
          value={billingCycle}
          onChange={(value) => setBillingCycle(value as 'monthly' | 'annually')}
        />
      </div>

      {/* 3. Pricing Cards */}
      <Space align="start" size={24} style={{ width: '100%', justifyContent: 'center' }}>
        {/* Basic Plan */}
        <Card title="基础版" style={{ width: 320, textAlign: 'center' }}>
          <Title level={2}>${billingCycle === 'monthly' ? plans.basic.monthly : (plans.basic.annually / 12).toFixed(0)}<Text type="secondary"> / 月</Text></Title>
          <Paragraph type="secondary">{billingCycle === 'annually' && `年付 $${plans.basic.annually}`}</Paragraph>
          <Button type="default" size="large" block style={{ marginBottom: 24 }}>开始使用</Button>
          <List
            dataSource={plans.basic.features}
            renderItem={(item) => <List.Item>{item}</List.Item>}
            split={false}
          />
        </Card>

        {/* Pro Plan */}
        <Badge.Ribbon text={<><CrownFilled /> 最受欢迎</>} color="gold">
          <Card title="专业版" style={{ width: 320, textAlign: 'center', borderColor: '#FFD700' }} headStyle={{ background: '#FFFBE6' }}>
            <Title level={2}>${billingCycle === 'monthly' ? plans.pro.monthly : (plans.pro.annually / 12).toFixed(0)}<Text type="secondary"> / 月</Text></Title>
            <Paragraph type="secondary">{billingCycle === 'annually' && `年付 $${plans.pro.annually}`}</Paragraph>
            <Button type="primary" size="large" block style={{ marginBottom: 24 }}>升级到专业版</Button>
            <List
              dataSource={plans.pro.features}
              renderItem={(item) => (
                <List.Item>
                  <Text strong={item.includes('高级') || item.includes('支持')}>
                    <CheckCircleTwoTone twoToneColor="#52c41a" style={{ marginRight: 8 }} />
                    {item}
                  </Text>
                </List.Item>
              )}
              split={false}
            />
          </Card>
        </Badge.Ribbon>
      </Space>
      
      <Divider />
    </div>
  );
};

export default SubscriptionPage;

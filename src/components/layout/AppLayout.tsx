import React, { useState } from 'react';
import {
  HistoryOutlined,
  PieChartOutlined,
  DatabaseOutlined,
  UserOutlined,
  CrownOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { Layout, Menu, Typography, Breadcrumb, Button, Space } from 'antd';

const { Content, Sider, Footer } = Layout;
const { Title, Text } = Typography;

type MenuItem = Required<MenuProps>['items'][number];

function getItem(
  label: React.ReactNode,
  key: React.Key,
  icon?: React.ReactNode,
  children?: MenuItem[],
): MenuItem {
  return { key, icon, children, label } as MenuItem;
}

const items: MenuItem[] = [
  getItem('Workbench', '1', <PieChartOutlined />),
  getItem('SessionHistory', '2', <HistoryOutlined />),
  getItem('TemplateList', '3', <DatabaseOutlined />),
  getItem('Subscription', '4', <CrownOutlined />),
  getItem('Settings', '5', <UserOutlined />),
];

interface AppLayoutProps {
  children: React.ReactNode;
  currentKey: string;
  onMenuClick: MenuProps['onClick'];
}

const AppLayout: React.FC<AppLayoutProps> = ({ children, currentKey, onMenuClick }) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={(value) => setCollapsed(value)}>
        <div 
          style={{ 
            height: 32, 
            margin: 16, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            gap: '8px',
            cursor: 'pointer'
          }}
          onClick={() => setCollapsed(!collapsed)}
        >
           <img 
             src="/icons/icon-16.png" 
             alt="Vaultmind Logo" 
             style={{ height: '100%', width: 'auto' }} 
           />
           <Title 
             level={4} 
             style={{ 
               color: 'white', 
               margin: 0,
               opacity: collapsed ? 0 : 1,
               width: collapsed ? 0 : 'auto',
               overflow: 'hidden',
               whiteSpace: 'nowrap',
               transition: 'width 0.2s ease-in-out, opacity 0.2s ease-in-out',
             }}
           >
            Vaultmind
           </Title>
        </div>
        <Menu 
          theme="dark" 
          selectedKeys={[currentKey]} 
          mode="inline" 
          items={items} 
          onClick={onMenuClick} 
        />
      </Sider>
      <Layout style={{ display: 'flex', flexDirection: 'column' }}>
        
        <div style={{ margin: '0 16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0' }}>
            <Breadcrumb items={[{ title: 'Vaultmind' }, { title: 'Workbench' }]} />
            <Space>
              <Typography.Text>hi, admin</Typography.Text>
              <Button type="link" size="small">退出</Button>
            </Space>
          </div>
        </div>
        
        <Content style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', margin: '0 16px' }}>
          {children}
        </Content>

        <Footer style={{ padding: '8px 24px', background: 'transparent', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ flex: 1 }}></div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <Text type="secondary">
                Copyright © 2026 VaultMind. All rights reserved.
              </Text>
            </div>
            <div style={{ flex: 1, textAlign: 'right' }}>
              <Text type="secondary">
               issue report to lee@gmail.com
              </Text>
            </div>
          </div>
        </Footer>
      </Layout>
    </Layout>
  );
};

export default AppLayout;

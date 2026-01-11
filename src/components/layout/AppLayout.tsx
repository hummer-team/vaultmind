import React, { useState } from 'react';
import {
  DesktopOutlined,
  PieChartOutlined,
  TeamOutlined,
  UserOutlined,
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
  getItem('Asset Center', '2', <DesktopOutlined />),
  getItem('Team Space', 'sub1', <TeamOutlined />, [
    getItem('Team', '3'),
    getItem('Shared', '4'),
  ]),
  getItem('Settings', '9', <UserOutlined />),
];

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={(value) => setCollapsed(value)}>
        <div style={{ height: 32, margin: 16, background: 'rgba(255, 255, 255, .2)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
           <Title level={4} style={{ color: 'white', margin: 0, opacity: collapsed ? 0 : 1, transition: 'opacity 0.3s' }}>Vaultmind</Title>
        </div>
        <Menu theme="dark" defaultSelectedKeys={['1']} mode="inline" items={items} />
      </Sider>
      <Layout>
        <Content style={{ margin: '0 16px' }}>
          {/* --- CRITICAL CHANGE: Create a header within the Content area --- */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0' }}>
            <Breadcrumb items={[{ title: 'Vaultmind' }, { title: 'Workbench' }]} />
            <Space>
              <Typography.Text>hi, admin</Typography.Text>
              <Button type="link" size="small">退出</Button>
            </Space>
          </div>
          {/* --- END CRITICAL CHANGE --- */}
          
          {/* The rest of the page content will be rendered here */}
          {children}
        </Content>
        <Footer style={{ padding: '12px 24px', background: 'transparent' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ flex: 1 }}></div> {/* Spacer */}
            <div style={{ flex: 1, textAlign: 'center' }}>
              <Text type="secondary">
                Copyright © 2026 VaultMind. All rights reserved.
              </Text>
            </div>
            <div style={{ flex: 1, textAlign: 'right' }}>
              <Text type="secondary">
               issue report to lee@gmail.com thanks
              </Text>
            </div>
          </div>
        </Footer>
      </Layout>
    </Layout>
  );
};

export default AppLayout;

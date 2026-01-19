import React, { useState, useEffect } from 'react';
import {
  HistoryOutlined,
  PieChartOutlined,
  DatabaseOutlined,
  UserOutlined,
  SettingOutlined,
  CrownOutlined,
  MessageOutlined,
  FullscreenOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { Layout, Menu, Typography, Space, Popover, Avatar } from 'antd';
import { useUserStore } from '../../status/appStatusManager.ts';

const { Content, Sider } = Layout;
const { Title } = Typography;

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
  getItem('Workbench', 'Workbench', <PieChartOutlined />),
  getItem('SessionHistory', 'SessionHistory', <HistoryOutlined />),
  getItem('Template', 'TemplateList', <DatabaseOutlined />),
  getItem('Subscription', 'Subscription', <CrownOutlined />),
  getItem('Feedback', 'feedback', <MessageOutlined />),
  getItem('Settings', 'Settings', <SettingOutlined />),
  getItem('NewSession', 'fullscreen', <FullscreenOutlined />),
];

interface AppLayoutProps {
  children: React.ReactNode;
  currentKey: string;
  onMenuClick: MenuProps['onClick'];
}

const AppLayout: React.FC<AppLayoutProps> = ({ children, currentKey, onMenuClick }) => {
  const [collapsed, setCollapsed] = useState(true);
  const { userProfile, fetchUserProfile } = useUserStore();

  useEffect(() => {
    fetchUserProfile();
  }, [fetchUserProfile]);

  const userMenuContent = (
    <div>
      <a href="#">退出</a>
    </div>
  );

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={(value) => setCollapsed(value)} collapsedWidth={48} style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
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
            style={{ flex: 1, minHeight: 0 }}
          />
        </div>
        <div style={{ 
          padding: collapsed ? '16px 0' : '16px',
          flexShrink: 0,
          display: 'flex',
          justifyContent: collapsed ? 'center' : 'flex-start',
          alignItems: 'center',
        }}>
          <Popover content={userMenuContent} placement="rightBottom" trigger="click">
            <Space style={{ cursor: 'pointer' }}>
              <Avatar src={userProfile?.avatar} icon={<UserOutlined />} />
              {!collapsed && <Typography.Text>hi, {userProfile?.nickname || 'admin'}</Typography.Text>}
            </Space>
          </Popover>
        </div>
      </Sider>
      <Layout style={{ 
        display: 'flex', 
        flexDirection: 'column',
        background: `radial-gradient(circle at top, #2a2a2e, #1e1e20)`
      }}>
        <Content style={{ margin: '16px' }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;

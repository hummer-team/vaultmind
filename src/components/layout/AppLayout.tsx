import React, { useState, useRef, useEffect } from 'react';
import {
  HistoryOutlined,
  PieChartOutlined,
  DatabaseOutlined,
  UserOutlined,
  SettingOutlined,
  CrownOutlined,
  DownOutlined,
  MessageOutlined,
  FullscreenOutlined, // Added FullscreenOutlined
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { Layout, Menu, Typography, Space, FloatButton, Popover, Avatar /* Removed Button */ } from 'antd';

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
  getItem('Workbench', '1', <PieChartOutlined />),
  getItem('SessionHistory', '2', <HistoryOutlined />),
  getItem('TemplateList', '3', <DatabaseOutlined />),
  getItem('Subscription', '4', <CrownOutlined />),
  getItem('Feedback', 'feedback', <MessageOutlined />),
  getItem('Settings', '5', <SettingOutlined />),
  getItem('Fullscreen', 'fullscreen', <FullscreenOutlined />), // Added Fullscreen menu item
];

interface AppLayoutProps {
  children: React.ReactNode;
  currentKey: string;
  onMenuClick: MenuProps['onClick'];
}

const AppLayout: React.FC<AppLayoutProps> = ({ children, currentKey, onMenuClick }) => {
  const [collapsed, setCollapsed] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const userMenuContent = (
    <div>
      <a href="#">退出</a>
    </div>
  );

  const handleScrollToBottom = () => {
    const content = contentRef.current;
    if (content) {
      content.scrollTo({ top: content.scrollHeight, behavior: 'smooth' });
    }
  };

  // Removed handleCloseSidebar function as it's no longer needed for sidePanel

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = content;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 20; // Within 20px of bottom
      // Removed isAtTop check
      // Only show if content is scrollable AND not at the bottom
      setShowScrollToBottom(scrollHeight > clientHeight && !isAtBottom);
    };

    content.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Call once on mount to set initial state

    return () => content.removeEventListener('scroll', handleScroll);
  }, [children]);

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={(value) => setCollapsed(value)} collapsedWidth={48} style={{ display: 'flex', flexDirection: 'column' }}> {/* Adjusted collapsedWidth */}
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
          padding: collapsed ? '16px 0' : '16px', // Adjust padding based on collapsed state
          flexShrink: 0,
          display: 'flex',
          justifyContent: collapsed ? 'center' : 'flex-start', // Center when collapsed
          alignItems: 'center',
        }}>
          <Popover content={userMenuContent} placement="rightBottom" trigger="click">
            <Space style={{ cursor: 'pointer' }}>
              <Avatar icon={<UserOutlined />} />
              {!collapsed && <Typography.Text>hi, admin</Typography.Text>}
            </Space>
          </Popover>
        </div>
      </Sider>
      <Layout style={{ 
        display: 'flex', 
        flexDirection: 'column',
        background: `radial-gradient(circle at top, #2a2a2e, #1e1e20)`
      }}>
        {/* Removed header for close button */}
        <Content ref={contentRef} style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', margin: '16px' }}> {/* Adjusted margin back to original */}
          {children}
        </Content>
      </Layout>
      <FloatButton 
        icon={<DownOutlined />}
        onClick={handleScrollToBottom}
        style={{
          display: showScrollToBottom ? 'block' : 'none',
          left: '50%',
          transform: 'translateX(-50%)',
          bottom: 40,
        }}
      />
    </Layout>
  );
};

export default AppLayout;

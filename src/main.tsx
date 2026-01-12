import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { App as AntdApp, ConfigProvider, theme, MenuProps } from 'antd';
import AppLayout from './components/layout/AppLayout';
import Workbench from './pages/workbench';
import SubscriptionPage from './pages/subscription/SubscriptionPage';
import 'antd/dist/reset.css';
import SettingsPage from "./pages/workbench/Settings.tsx";
import SessionListPage   from "./pages/session/SessionListPage.tsx";
import TemplateListPage from "./pages/asset-center/TemplateListPage.tsx";

const App = () => {
  // --- CRITICAL CHANGE 1: Add state and handlers for page routing ---
  const [currentPage, setCurrentPage] = useState('1'); // '1' is the key for Workbench

  const handleMenuClick: MenuProps['onClick'] = (e) => {
    console.log('Menu clicked:', e.key);
    setCurrentPage(e.key);
  };

  const renderCurrentPage = () => {
    switch (currentPage) {
      case '1':
        return <Workbench />;
      case '2':
        return <SessionListPage />;
      case '3':
        return <TemplateListPage />;
      case '4':
        return <SubscriptionPage />;
      case '5':
        return <SettingsPage/>
      default:
        return <Workbench />; // Default to Workbench
    }
  };
  // --- END CRITICAL CHANGE 1 ---

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <AntdApp style={{ height: '100%' }}>
        {/* --- CRITICAL CHANGE 2: Pass routing props to AppLayout --- */}
        <AppLayout
          currentKey={currentPage}
          onMenuClick={handleMenuClick}
        >
          {renderCurrentPage()}
        </AppLayout>
        {/* --- END CRITICAL CHANGE 2 --- */}
      </AntdApp>
    </ConfigProvider>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

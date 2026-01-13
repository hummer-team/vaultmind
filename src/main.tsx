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
import FeedbackDrawer from './pages/feedback/FeedbackDrawer.tsx';

const App = () => {
  const [currentPage, setCurrentPage] = useState('1');
  const [isFeedbackDrawerOpen, setIsFeedbackDrawerOpen] = useState(false);

  // Make the function async to use await
  const handleMenuClick: MenuProps['onClick'] = async (e) => {
    console.log('Menu clicked:', e.key);
    if (e.key === 'feedback') {
      setIsFeedbackDrawerOpen(true);
      return;
    }
    if (e.key === 'fullscreen') {
      if (chrome.tabs && chrome.runtime) {
        try {
          // First, await the closing of the current side panel
          await chrome.runtime.sendMessage({ type: 'CLOSE_SIDEBAR' });
          // Then, open in a new tab
          chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
        } catch (error) {
          console.error("Error during fullscreen action:", error);
          // Fallback: still open the new tab even if closing fails
          chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
        }
      } else {
        console.warn('Chrome APIs not available for fullscreen action.');
      }
      return;
    }
    setCurrentPage(e.key);
  };

  const renderCurrentPage = () => {
    switch (currentPage) {
      case 'Workbench': // Changed from 'Workbench' to '1' to match menu item key
        return <Workbench 
          isFeedbackDrawerOpen={isFeedbackDrawerOpen} 
          setIsFeedbackDrawerOpen={setIsFeedbackDrawerOpen} 
        />;
      case 'SessionList': // Changed from 'SessionList' to '2'
        return <SessionListPage />;
      case 'TemplateList': // Changed from 'TemplateList' to '3'
        return <TemplateListPage />;
      case 'Subscription': // Changed from 'Subscription' to '4'
        return <SubscriptionPage />;
      case 'Settings': // Changed from 'Settings' to '5'
        return <SettingsPage/>
      default:
        return <Workbench 
          isFeedbackDrawerOpen={isFeedbackDrawerOpen} 
          setIsFeedbackDrawerOpen={setIsFeedbackDrawerOpen} 
        />;
    }
  };

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <AntdApp style={{ height: '100%' }}>
        <AppLayout
          currentKey={currentPage}
          onMenuClick={handleMenuClick}
        >
          {renderCurrentPage()}
        </AppLayout>
        <FeedbackDrawer 
          open={isFeedbackDrawerOpen} 
          onClose={() => setIsFeedbackDrawerOpen(false)} 
        />
      </AntdApp>
    </ConfigProvider>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

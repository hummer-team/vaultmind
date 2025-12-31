import React from 'react';
import ReactDOM from 'react-dom/client';
import Workbench from './pages/workbench';
import { App, ConfigProvider, theme } from 'antd';
import 'antd/dist/reset.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
      }}
    >
      <App style={{ height: '100%' }}>
        <Workbench />
      </App>
    </ConfigProvider>
  </React.StrictMode>,
);

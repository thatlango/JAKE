import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { installAccessibilityBridge } from './accessibility';
import './index.css';
import './product.css';
import './sprint.css';
import './tds-jakeos.css';
import './ops-pipeline.css';

document.documentElement.dataset.tds = '2.0';
document.documentElement.dataset.product = 'jakeos';
installAccessibilityBridge();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

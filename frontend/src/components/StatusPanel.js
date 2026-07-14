import React, { useState, useEffect, useContext } from 'react';
import './StatusPanel.css';
import { BlobContext } from '../contexts/BlobContext';
import DraggableWidget from './DraggableWidget';

const StatusPanel = () => {
  const [apiStatus, setApiStatus] = useState('OFFLINE');
  const [micPermission, setMicPermission] = useState('PENDING');
  const { isSpeaking } = useContext(BlobContext);

  // Check API status every 5 seconds
  useEffect(() => {
    const checkApiStatus = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/status');
        if (response.ok) {
          setApiStatus('CONNECTED');
        } else {
          setApiStatus('ERROR');
        }
      } catch (error) {
        setApiStatus('OFFLINE');
      }
    };

    checkApiStatus();
    const interval = setInterval(checkApiStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // Check microphone permission
  useEffect(() => {
    const checkMic = async () => {
      try {
        const result = await navigator.permissions.query({ name: 'microphone' });
        setMicPermission(result.state === 'granted' ? 'GRANTED' : result.state === 'denied' ? 'DENIED' : 'PENDING');
        result.onchange = () => {
          setMicPermission(result.state === 'granted' ? 'GRANTED' : result.state === 'denied' ? 'DENIED' : 'PENDING');
        };
      } catch (e) {
        setMicPermission('UNKNOWN');
      }
    };
    checkMic();
  }, []);

  const getStatusClass = (value) => {
    if (['CONNECTED', 'ONLINE', 'GRANTED', 'ACTIVE', 'SYNCED'].includes(value)) return 'status-value';
    if (['PENDING', 'UNKNOWN'].includes(value)) return 'status-value warning';
    return 'status-value error';
  };

  return (
    <DraggableWidget id="status-panel" defaultPosition={{ x: window.innerWidth - 310, y: window.innerHeight - 350 }}>
      <div className="status-panel-container">
        <div className="status-header">
          <span>SYS.STATUS</span>
        </div>
        <div className="status-list">
          <div className="status-item">
            <span className="status-label">SYSTEM</span>
            <span className="status-value">ONLINE</span>
          </div>
          <div className="status-item">
            <span className="status-label">MICROPHONE</span>
            <span className={getStatusClass(micPermission)}>{micPermission}</span>
          </div>
          <div className="status-item">
            <span className="status-label">TTS ENGINE</span>
            <span className={isSpeaking ? 'status-value speaking' : 'status-value'}>{isSpeaking ? 'SPEAKING' : 'READY'}</span>
          </div>
          <div className="status-item">
            <span className="status-label">API SERVER</span>
            <span className={getStatusClass(apiStatus)}>{apiStatus}</span>
          </div>
          <div className="status-item">
            <span className="status-label">LLM MODEL</span>
            <span className={getStatusClass(apiStatus)}>{apiStatus === 'CONNECTED' ? 'ACTIVE' : 'OFFLINE'}</span>
          </div>
        </div>
      </div>
    </DraggableWidget>
  );
};

export default StatusPanel;

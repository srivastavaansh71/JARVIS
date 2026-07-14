import React, { useState, useContext } from 'react';
import './Navbar.css';
import { BlobContext } from '../contexts/BlobContext';

const Navbar = () => {
  const [showSettings, setShowSettings] = useState(false);
  const { blobColor, setBlobColor, blobSize, setBlobSize, blobSensitivity, setBlobSensitivity, speechLang, setSpeechLang } = useContext(BlobContext);

  return (
    <nav className="futuristic-navbar">
      <div className="nav-brand">J.A.R.V.I.S</div>
      
      <div className="nav-links">
        <span className="nav-item">Core</span>
        <span className="nav-item">Systems</span>
        <span className="nav-item">Database</span>
        <span className="nav-item">Protocols</span>
      </div>

      <div className="nav-user">
        <div className="settings-container">
          <span 
            className="nav-item settings-icon"
            onClick={() => setShowSettings(!showSettings)}
          >
            ⚙ Settings
          </span>
          {showSettings && (
            <div className="settings-dropdown">
              <div className="settings-header">BLOB CONFIGURATION</div>
              
              <div className="settings-row">
                <label>Color Shift</label>
                <input 
                  type="color" 
                  value={blobColor} 
                  onChange={(e) => setBlobColor(e.target.value)}
                  className="color-picker"
                />
              </div>

              <div className="settings-row">
                <label>Size: {blobSize}px</label>
                <input 
                  type="range" 
                  min="150" 
                  max="500" 
                  value={blobSize}
                  onChange={(e) => setBlobSize(Number(e.target.value))}
                  className="size-slider"
                />
              </div>

              <div className="settings-row">
                <label>Sensitivity: {blobSensitivity}</label>
                <input 
                  type="range" 
                  min="0.1" 
                  max="3.0" 
                  step="0.1"
                  value={blobSensitivity}
                  onChange={(e) => setBlobSensitivity(Number(e.target.value))}
                  className="size-slider"
                />
              </div>

              <div className="settings-row">
                <label>Speech Language</label>
                <select 
                  value={speechLang}
                  onChange={(e) => setSpeechLang(e.target.value)}
                  className="lang-select"
                >
                  <option value="en-US">English (US)</option>
                  <option value="en-IN">English (India)</option>
                  <option value="hi-IN">Hindi (India)</option>
                </select>
              </div>
            </div>
          )}
        </div>
        <div className="user-avatar" title="Operator Status: ONLINE"></div>
      </div>
    </nav>
  );
};

export default Navbar;

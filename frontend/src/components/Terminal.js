import React, { useContext, useEffect, useRef } from 'react';
import './Terminal.css';
import { BlobContext } from '../contexts/BlobContext';
import DraggableWidget from './DraggableWidget';

const Terminal = () => {
  const { transcripts, interimTranscript, interimLlmResponse, isSpeaking } = useContext(BlobContext);
  const endRef = useRef(null);

  // Auto-scroll to bottom whenever transcripts or interimTranscript change
  useEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcripts, interimTranscript, interimLlmResponse]);

  return (
    <DraggableWidget id="terminal-widget" defaultPosition={{ x: window.innerWidth / 2 - 450, y: window.innerHeight - 150 }} className="terminal-draggable">
      <div className="jarvis-terminal-wrapper">
        <div className="jarvis-terminal">
          <div className="terminal-header">
            <span className="terminal-title">SPEECH RECOGNITION TERMINAL</span>
            <div className="terminal-status-group">
              {isSpeaking && <span className="speaking-indicator">🔊 SPEAKING</span>}
              <span className="terminal-status">LIVE_</span>
            </div>
          </div>
          
          <div className="terminal-content">
            {transcripts.length === 0 && !interimTranscript && !interimLlmResponse && (
              <div className="terminal-line welcome-text">
                <span className="prompt">JARVIS: </span>
                <span style={{ color: '#00ffe1' }}>Systems online. Click the microphone to begin, sir.</span>
              </div>
            )}
            
            {transcripts.map((entry, idx) => (
              <div key={idx} className={`terminal-line final-text ${entry.role === 'llm' ? 'ai-response' : ''} ${entry.role === 'ambient' ? 'ambient-text' : ''}`}>
                <span className="prompt">{entry.role === 'llm' ? 'JARVIS: ' : entry.role === 'ambient' ? '~ ' : '> '}</span>
                {entry.role === 'llm' ? <span style={{ color: '#00ffe1' }}>{entry.text}</span> : entry.role === 'ambient' ? <span style={{ color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>{entry.text}</span> : entry.text}
              </div>
            ))}
            
            {interimTranscript && (
              <div className="terminal-line interim-text">
                <span className="prompt">{'> '}</span>
                {interimTranscript}
                <span className="cursor">_</span>
              </div>
            )}

            {interimLlmResponse && (
              <div className="terminal-line interim-text ai-response">
                <span className="prompt">JARVIS: </span>
                <span style={{ color: '#00ffe1' }}>{interimLlmResponse}</span>
                <span className="cursor">_</span>
              </div>
            )}
            
            {/* Invisible element to scroll to */}
            <div ref={endRef} />
          </div>
        </div>
      </div>
    </DraggableWidget>
  );
};

export default Terminal;

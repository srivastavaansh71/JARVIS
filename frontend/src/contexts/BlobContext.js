import React, { createContext, useState, useEffect, useCallback } from 'react';

export const BlobContext = createContext();

export const BlobProvider = ({ children }) => {
  const [blobColor, setBlobColor] = useState('#0084ff');
  const [blobSize, setBlobSize] = useState(250);
  const [blobSensitivity, setBlobSensitivity] = useState(0.3);
  const [transcripts, setTranscripts] = useState([]);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [interimLlmResponse, setInterimLlmResponse] = useState('');
  const [speechLang, setSpeechLang] = useState('en-US');
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    // Clear out any old position data so it doesn't conflict
    localStorage.removeItem('jarvis-blob-position');
    
    const savedColor = localStorage.getItem('jarvis-blob-color');
    const savedSize = localStorage.getItem('jarvis-blob-size');
    const savedSensitivity = localStorage.getItem('jarvis-blob-sensitivity');
    const savedLang = localStorage.getItem('jarvis-speech-lang');
    
    if (savedColor) setBlobColor(savedColor);
    if (savedSize) setBlobSize(Number(savedSize));
    if (savedSensitivity) setBlobSensitivity(Number(savedSensitivity));
    if (savedLang) setSpeechLang(savedLang);
  }, []);

  const saveSettings = () => {
    localStorage.setItem('jarvis-blob-color', blobColor);
    localStorage.setItem('jarvis-blob-size', blobSize.toString());
    localStorage.setItem('jarvis-blob-sensitivity', blobSensitivity.toString());
    localStorage.setItem('jarvis-speech-lang', speechLang);
  };

  const fetchGroqResponse = useCallback(async (userText) => {
    try {
      setInterimLlmResponse('');

      const response = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: userText })
      });

      if (!response.ok) {
        throw new Error(`Backend error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let streamedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const data = JSON.parse(trimmed.slice(6));

            if (data.type === 'token') {
              // Real-time token streaming — update the UI instantly
              streamedText += data.content;
              setInterimLlmResponse(streamedText);
            }

            if (data.type === 'done') {
              // Finalize the text response immediately (no waiting for TTS)
              setInterimLlmResponse('');
              setTranscripts(prev => [...prev, { role: 'llm', text: data.text }]);
            }

            if (data.type === 'audio') {
              // Play TTS audio when it arrives (separate from text)
              if (data.audioUrl) {
                setIsSpeaking(true);
                const audio = new Audio(data.audioUrl);
                audio.onended = () => setIsSpeaking(false);
                audio.onerror = () => setIsSpeaking(false);
                audio.play().catch(e => {
                  console.error("Audio playback failed:", e);
                  setIsSpeaking(false);
                });
              }
            }

            if (data.type === 'error') {
              setInterimLlmResponse('');
              setTranscripts(prev => [...prev, { role: 'llm', text: `Error: ${data.message}` }]);
            }
          } catch (e) {
            // Skip malformed JSON lines
          }
        }
      }

    } catch (error) {
      console.error("Error fetching from backend:", error);
      setInterimLlmResponse('');
      setTranscripts(prev => [...prev, { role: 'llm', text: 'Error connecting to J.A.R.V.I.S Core. Is the backend running?' }]);
    }
  }, []);

  return (
    <BlobContext.Provider value={{
      blobColor, setBlobColor,
      blobSize, setBlobSize,
      blobSensitivity, setBlobSensitivity,
      transcripts, setTranscripts,
      interimTranscript, setInterimTranscript,
      interimLlmResponse, setInterimLlmResponse,
      isSpeaking,
      speechLang, setSpeechLang,
      saveSettings, fetchGroqResponse
    }}>
      {children}
    </BlobContext.Provider>
  );
};

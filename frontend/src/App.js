import './App.css';
import Navbar from './components/Navbar';
import PlasmaBlob from './components/blob';
import Terminal from './components/Terminal';
import { BlobProvider } from './contexts/BlobContext';
import StatusPanel from './components/StatusPanel';
import HUDOverlay from './components/HUDOverlay';

function App() {
  return (
    <BlobProvider>
      <div className="app-container">
        <Navbar />
        <HUDOverlay />
        <StatusPanel />
        <PlasmaBlob />
        <Terminal />
      </div>
    </BlobProvider>
  );
}

export default App;

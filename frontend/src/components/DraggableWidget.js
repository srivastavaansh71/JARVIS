import React, { useState, useEffect, useRef } from 'react';
import './DraggableWidget.css';

const DraggableWidget = ({ id, defaultPosition, children, className = '' }) => {
  // Load saved position from localStorage or use default
  const getInitialPosition = () => {
    const saved = localStorage.getItem(`jarvis-widget-pos-${id}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return defaultPosition;
      }
    }
    return defaultPosition;
  };

  const [position, setPosition] = useState(getInitialPosition);
  const [isMovable, setIsMovable] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  
  const widgetRef = useRef(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // Handle Right Click
  const handleContextMenu = (e) => {
    e.preventDefault(); // Prevent default browser context menu
    e.stopPropagation();
    
    // Position menu near cursor
    setMenuPos({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  };

  // Close menu if clicked outside
  useEffect(() => {
    const closeMenu = () => setMenuOpen(false);
    if (menuOpen) {
      window.addEventListener('click', closeMenu);
    }
    return () => window.removeEventListener('click', closeMenu);
  }, [menuOpen]);

  // Handle Dragging
  const handlePointerDown = (e) => {
    if (!isMovable) return;
    if (e.button !== 0) return; // Only left click

    isDragging.current = true;
    dragStart.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
    
    e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDragging.current || !isMovable) return;
    
    setPosition({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    });
  };

  const handlePointerUp = (e) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    e.target.releasePointerCapture(e.pointerId);
  };

  // Menu Actions
  const toggleMove = () => {
    setIsMovable(true);
    setMenuOpen(false);
  };

  const savePosition = () => {
    setIsMovable(false);
    setMenuOpen(false);
    localStorage.setItem(`jarvis-widget-pos-${id}`, JSON.stringify(position));
  };

  return (
    <>
      <div 
        ref={widgetRef}
        className={`draggable-widget-container ${isMovable ? 'movable' : ''} ${className}`}
        style={{ left: position.x, top: position.y }}
        onContextMenu={handleContextMenu}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {isMovable && <div className="movable-overlay">DRAG TO MOVE</div>}
        {children}
      </div>

      {menuOpen && (
        <div 
          className="custom-context-menu"
          style={{ left: menuPos.x, top: menuPos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {!isMovable && <button onClick={toggleMove}>MOVE</button>}
          {isMovable && <button onClick={savePosition}>SAVE</button>}
        </div>
      )}
    </>
  );
};

export default DraggableWidget;

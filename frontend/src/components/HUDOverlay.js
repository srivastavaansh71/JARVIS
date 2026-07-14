import React, { useState, useEffect } from 'react';
import './HUDOverlay.css';
import DraggableWidget from './DraggableWidget';

const HUDOverlay = () => {
  const [time, setTime] = useState(new Date());
  const [weather, setWeather] = useState({ temp: '--', condition: 'Fetching...' });
  const [location, setLocation] = useState({ city: 'UNKNOWN', coords: '00.0000° N, 00.0000° E' });

  // Update Clock
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch Location and Weather
  useEffect(() => {
    const fetchLocationAndWeather = async () => {
      try {
        // Fetch approximate location based on IP
        const ipRes = await fetch('https://ipapi.co/json/');
        const ipData = await ipRes.json();
        
        if (ipData.error) throw new Error('IP limit reached');

        const lat = ipData.latitude;
        const lon = ipData.longitude;
        const city = ipData.city ? ipData.city.toUpperCase() : 'UNKNOWN';
        
        setLocation({
          city: city,
          coords: `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'E' : 'W'}`
        });

        // Fetch Weather using Open-Meteo (No API Key Required)
        const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
        const weatherData = await weatherRes.json();

        if (weatherData && weatherData.current_weather) {
          const w = weatherData.current_weather;
          setWeather({
            temp: `${w.temperature}°C`,
            condition: getWeatherCondition(w.weathercode)
          });
        }
      } catch (err) {
        console.error("HUD Data Fetch Error:", err);
        // Fallback sci-fi data if offline/rate-limited
        setLocation({ city: 'LOCAL SYSTEM', coords: 'SECURE UPLINK' });
        setWeather({ temp: 'OPT', condition: 'STABLE' });
      }
    };

    fetchLocationAndWeather();
    // Refresh weather every 15 mins
    const weatherTimer = setInterval(fetchLocationAndWeather, 15 * 60 * 1000);
    return () => clearInterval(weatherTimer);
  }, []);

  const getWeatherCondition = (code) => {
    // WMO Weather interpretation codes
    if (code === 0) return 'CLEAR SKY';
    if (code <= 3) return 'PARTLY CLOUDY';
    if (code <= 49) return 'FOG / HAZE';
    if (code <= 69) return 'RAIN / DRIZZLE';
    if (code <= 79) return 'SNOW';
    if (code <= 99) return 'THUNDERSTORM';
    return 'UNKNOWN';
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', { hour12: false });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }).toUpperCase();
  };

  return (
    <div className="hud-overlay-container">
      
      {/* Central Arc Reactor / Targeting Reticle */}
      <DraggableWidget id="hud-reticle" defaultPosition={{ x: window.innerWidth / 2 - 150, y: window.innerHeight / 2 - 150 }}>
        <div className="hud-center-reticle">
          <svg viewBox="0 0 200 200" className="arc-svg">
            <circle cx="100" cy="100" r="90" className="arc-outer" />
            <circle cx="100" cy="100" r="75" className="arc-middle" strokeDasharray="10 15" />
            <circle cx="100" cy="100" r="60" className="arc-inner" strokeDasharray="40 10" />
            <path d="M 100 20 L 100 0 M 100 180 L 100 200 M 20 100 L 0 100 M 180 100 L 200 100" className="arc-crosshairs" />
          </svg>
        </div>
      </DraggableWidget>

      {/* Top Left: Clock & Date */}
      <DraggableWidget id="hud-clock" defaultPosition={{ x: 30, y: 80 }}>
        <div className="hud-widget hud-top-left">
          <div className="hud-title">SYSTEM CLOCK</div>
          <div className="hud-clock">{formatTime(time)}</div>
          <div className="hud-date">{formatDate(time)}</div>
          <div className="hud-decor-line"></div>
        </div>
      </DraggableWidget>

      {/* Top Right: Location & Weather */}
      <DraggableWidget id="hud-weather" defaultPosition={{ x: window.innerWidth - 270, y: 80 }}>
        <div className="hud-widget hud-top-right">
          <div className="hud-title">ENVIRONMENT</div>
          <div className="hud-info-row">
            <span className="hud-label">LOC:</span>
            <span className="hud-value">{location.city}</span>
          </div>
          <div className="hud-info-row sub-row">
            <span className="hud-value sub-text">{location.coords}</span>
          </div>
          
          <div className="hud-info-row mt-2">
            <span className="hud-label">TEMP:</span>
            <span className="hud-value">{weather.temp}</span>
          </div>
          <div className="hud-info-row sub-row">
            <span className="hud-value sub-text">{weather.condition}</span>
          </div>
          <div className="hud-decor-line right"></div>
        </div>
      </DraggableWidget>

      {/* Bottom Left: Diagnostics */}
      <DraggableWidget id="hud-diagnostics" defaultPosition={{ x: 30, y: window.innerHeight - 150 }}>
        <div className="hud-widget hud-bottom-left">
          <div className="hud-title">DIAGNOSTICS</div>
          <div className="hud-info-row">
            <span className="hud-label">CPU:</span>
            <span className="hud-value text-green">STABLE</span>
          </div>
          <div className="hud-info-row">
            <span className="hud-label">MEM:</span>
            <span className="hud-value text-green">NOMINAL</span>
          </div>
          <div className="hud-info-row">
            <span className="hud-label">NET:</span>
            <span className="hud-value text-cyan">SECURE</span>
          </div>
        </div>
      </DraggableWidget>

    </div>
  );
};

export default HUDOverlay;

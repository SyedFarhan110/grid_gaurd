'use client';
import { useState, useEffect } from 'react';
import { CloudRain, Wind, Thermometer, Droplets, Sun, AlertTriangle, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const WEATHER_IMPACTS = [
  { condition: 'High Temperature (>40°C)',  impact: 'Increases conductor sag, reduces insulation rating. Raises fault risk by ~18%.', severity: 'high'   },
  { condition: 'Heavy Rainfall (>20mm)',     impact: 'Insulation breakdown, tree contact faults. Increases SLG fault likelihood.', severity: 'high'   },
  { condition: 'High Wind Speed (>40km/h)', impact: 'Conductor swing, vegetation contact. Primary cause of line faults in feeders.', severity: 'medium' },
  { condition: 'High Humidity (>85%)',       impact: 'Moisture ingress into transformers, flashover risk on aged insulators.', severity: 'medium' },
  { condition: 'Lightning / Storms',         impact: 'Direct strike on line or induced surges. Requires surge arrester inspection.', severity: 'critical' },
];

const tempImpactData = [
  { range: '<30°C', riskAdj: -5  },
  { range: '30-35', riskAdj:  0  },
  { range: '35-40', riskAdj:  8  },
  { range: '40-42', riskAdj: 14  },
  { range: '>42°C', riskAdj: 22  },
];

const generateHourlyLoadEstimate = () => Array.from({ length: 24 }, (_, h) => {
  const base = h >= 8 && h <= 22 ? 9.5 : 6.2;
  const peak = h >= 12 && h <= 16 ? 3.5 : 0;
  const noise = (Math.random() - 0.5) * 0.8;
  return { hour: `${String(h).padStart(2, '0')}:00`, load: parseFloat((base + peak + noise).toFixed(1)) };
});

// Karachi coordinates
const KARACHI_LAT = 24.8607;
const KARACHI_LON = 67.0011;

interface WeatherData {
  temp: number;
  humidity: number;
  wind: number;
  rain: number;
  feelsLike: number;
  pressure: number;
  weatherCode: number;
  isDay: boolean;
  lastUpdated: string;
}

function WeatherCard({ icon: Icon, label, value, unit, color, warning }: {
  icon: any; label: string; value: string | number; unit?: string; color: string; warning?: string;
}) {
  return (
    <div className="weather-card">
      <div className="weather-card-header">
        <Icon size={16} color={color} />
        {warning && <AlertTriangle size={12} color="var(--warn-500)" />}
      </div>
      <div className="weather-card-value" style={{ color }}>
        {value}
        <span className="weather-card-unit">{unit}</span>
      </div>
      <div className="weather-card-label">{label}</div>
      {warning && <div className="weather-card-warning">{warning}</div>}
      
      <style jsx>{`
        .weather-card {
          background: var(--bg-card);
          border: 1px solid ${warning ? 'var(--warn-500)40' : 'var(--border-subtle)'};
          border-radius: 8px;
          padding: clamp(10px, 2vw, 14px) clamp(12px, 2vw, 16px);
          min-width: 0;
        }
        .weather-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }
        .weather-card-value {
          font-family: var(--font-display);
          font-size: clamp(18px, 5vw, 24px);
          font-weight: 700;
          white-space: nowrap;
        }
        .weather-card-unit {
          font-size: clamp(10px, 3vw, 12px);
          color: var(--text-dim);
          margin-left: 3px;
          font-family: var(--font-mono);
        }
        .weather-card-label {
          font-family: var(--font-mono);
          font-size: clamp(8px, 2vw, 10px);
          color: var(--text-dim);
          margin-top: 4px;
          letter-spacing: 0.06em;
          word-break: break-word;
        }
        .weather-card-warning {
          font-family: var(--font-mono);
          font-size: clamp(7px, 1.8vw, 9px);
          color: var(--warn-500);
          margin-top: 6px;
          word-break: break-word;
        }
      `}</style>
    </div>
  );
}

export default function WeatherAnalysis() {
  const [weatherData, setWeatherData] = useState<WeatherData>({
    temp: 0,
    humidity: 0,
    wind: 0,
    rain: 0,
    feelsLike: 0,
    pressure: 0,
    weatherCode: 0,
    isDay: true,
    lastUpdated: ''
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hourlyLoadEstimate, setHourlyLoadEstimate] = useState<any[]>([]);

  const fetchWeatherData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?` +
        `latitude=${KARACHI_LAT}&longitude=${KARACHI_LON}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,` +
        `precipitation,rain,weather_code,wind_speed_10m,is_day,pressure_msl` +
        `&timezone=Asia/Karachi`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch weather data');
      }

      const data = await response.json();
      const current = data.current;

      setWeatherData({
        temp: Math.round(current.temperature_2m),
        humidity: Math.round(current.relative_humidity_2m),
        wind: Math.round(current.wind_speed_10m),
        rain: current.rain || current.precipitation || 0,
        feelsLike: Math.round(current.apparent_temperature),
        pressure: Math.round(current.pressure_msl),
        weatherCode: current.weather_code,
        isDay: current.is_day === 1,
        lastUpdated: current.time
      });
    } catch (err) {
      console.error('Weather fetch error:', err);
      setError('Failed to load weather data');
      // Set fallback data for Karachi
      setWeatherData({
        temp: 32,
        humidity: 65,
        wind: 18,
        rain: 0,
        feelsLike: 35,
        pressure: 1012,
        weatherCode: 1,
        isDay: true,
        lastUpdated: new Date().toISOString()
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeatherData();
    setHourlyLoadEstimate(generateHourlyLoadEstimate());

    // Refresh every 15 minutes
    const interval = setInterval(fetchWeatherData, 15 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  const formatLastUpdated = (timestamp: string) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Karachi'
    });
  };

  if (error && !weatherData.temp) {
    return (
      <div className="weather-error">
        <AlertTriangle size={24} color="var(--warn-500)" />
        <p>{error}</p>
        <button onClick={fetchWeatherData} className="retry-btn">
          Retry
        </button>
        
        <style jsx>{`
          .weather-error {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 12px;
            padding: 40px;
            text-align: center;
            color: var(--text-secondary);
            font-family: var(--font-mono);
          }
          .retry-btn {
            background: var(--accent-500);
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-family: var(--font-mono);
            font-size: 12px;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="weather-analysis">
      {/* Header */}
      <div className="weather-header">
        <div className="header-top">
          <div>
            <h2 className="weather-title">
              Weather-Aware Analysis
            </h2>
            <p className="weather-subtitle">
              Karachi · K-Electric Grid · Environmental Impact Assessment
            </p>
          </div>
          <div className="header-actions">
            <div className="last-updated">
              <span className="live-dot" />
              <span className="update-text">
                {weatherData.lastUpdated ? formatLastUpdated(weatherData.lastUpdated) : 'Updating...'}
              </span>
            </div>
            <button 
              onClick={fetchWeatherData} 
              className={`refresh-btn ${loading ? 'spinning' : ''}`}
              disabled={loading}
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Weather cards grid */}
      <div className="weather-cards-wrapper">
        <div className="weather-cards-grid">
          <WeatherCard 
            icon={Thermometer} 
            label="TEMPERATURE"  
            value={weatherData.temp}     
            unit="°C"   
            color="var(--alert-400)" 
            warning={weatherData.temp > 40 ? 'Extreme heat — high load risk' : undefined} 
          />
          <WeatherCard 
            icon={Droplets}   
            label="HUMIDITY"      
            value={weatherData.humidity} 
            unit="%"    
            color="var(--accent-400)" 
            warning={weatherData.humidity > 80 ? 'High moisture — insulation risk' : undefined} 
          />
          <WeatherCard 
            icon={Wind}       
            label="WIND SPEED"    
            value={weatherData.wind}     
            unit="km/h" 
            color="var(--text-secondary)" 
            warning={weatherData.wind > 40 ? 'High winds — conductor swing risk' : undefined}
          />
          <WeatherCard 
            icon={CloudRain}  
            label="PRECIPITATION" 
            value={weatherData.rain.toFixed(1)}     
            unit="mm"   
            color="var(--accent-500)" 
            warning={weatherData.rain > 20 ? 'Heavy rain — insulation risk' : undefined}
          />
        </div>
      </div>

      {/* Additional weather info */}
      <div className="extra-info">
        <div className="info-item">
          <Thermometer size={14} color="var(--text-dim)" />
          <span>Feels like {weatherData.feelsLike}°C</span>
        </div>
        <div className="info-item">
          <Wind size={14} color="var(--text-dim)" />
          <span>{weatherData.pressure} hPa</span>
        </div>
        <div className="info-item">
          <Sun size={14} color={weatherData.isDay ? 'var(--warn-500)' : 'var(--text-dim)'} />
          <span>{weatherData.isDay ? 'Daytime' : 'Nighttime'}</span>
        </div>
      </div>

      {/* Charts section */}
      <div className="charts-grid">
        <div className="chart-container">
          <div className="chart-label">
            ESTIMATED DAILY LOAD PATTERN (MW)
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={hourlyLoadEstimate}>
              <XAxis dataKey="hour" tick={{ fontSize: 8, fill: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} interval={3} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-dim)', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 11 }}
                itemStyle={{ color: 'var(--accent-400)' }}
              />
              <Bar dataKey="load" name="Load (MW)" radius={[2, 2, 0, 0]}>
                {hourlyLoadEstimate.map((d, i) => (
                  <Cell key={i} fill={d.load > 11 ? 'var(--alert-400)' : d.load > 9 ? 'var(--warn-500)' : 'var(--accent-500)'} opacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-container">
          <div className="chart-label">
            TEMPERATURE → FAULT RISK ADJUSTMENT
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={tempImpactData} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 9, fill: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={v => `+${v}%`} />
              <YAxis type="category" dataKey="range" tick={{ fontSize: 9, fill: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} width={50} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-dim)', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 11 }}
              />
              <Bar dataKey="riskAdj" name="Risk Adj." radius={[0, 3, 3, 0]}>
                {tempImpactData.map((d, i) => (
                  <Cell key={i} fill={d.riskAdj > 15 ? 'var(--alert-500)' : d.riskAdj > 5 ? 'var(--warn-500)' : 'var(--normal-500)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Weather impact table */}
      <div className="impact-table-container">
        <div className="impact-table-header">
          WEATHER CONDITIONS → GRID IMPACT ANALYSIS
        </div>
        <div className="impact-table-body">
          {WEATHER_IMPACTS.map((item, i) => {
            const sevColor = item.severity === 'critical' ? 'var(--alert-500)' : item.severity === 'high' ? 'var(--warn-500)' : 'var(--accent-400)';
            return (
              <div key={i} className="impact-row" style={{ borderLeft: `3px solid ${sevColor}`, border: `1px solid ${sevColor}20` }}>
                <span className="impact-condition">{item.condition}</span>
                <span className="impact-description">{item.impact}</span>
                <span className="impact-severity" style={{ color: sevColor }}>{item.severity}</span>
              </div>
            );
          })}
        </div>
      </div>

      <style jsx>{`
        .weather-analysis {
          display: flex;
          flex-direction: column;
          gap: 16px;
          width: 100%;
          max-width: 100%;
          overflow: hidden;
        }

        .weather-header {
          text-align: left;
        }

        .header-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          flex-wrap: wrap;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }

        .weather-title {
          font-family: var(--font-display);
          font-size: clamp(18px, 5vw, 20px);
          font-weight: 800;
          color: var(--text-primary);
          margin: 0;
        }

        .weather-subtitle {
          font-family: var(--font-mono);
          font-size: clamp(9px, 2.5vw, 10px);
          color: var(--text-dim);
          margin: 4px 0 0;
          letter-spacing: 0.06em;
        }

        .last-updated {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .live-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--success-500);
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        .update-text {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--text-dim);
        }

        .refresh-btn {
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: 6px;
          padding: 6px;
          cursor: pointer;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          transition: all 0.2s;
        }

        .refresh-btn:hover:not(:disabled) {
          background: var(--accent-500);
          color: white;
          border-color: var(--accent-500);
        }

        .refresh-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .weather-cards-wrapper {
          width: 100%;
          overflow: hidden;
        }

        .weather-cards-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          width: 100%;
          min-width: 0;
        }

        .extra-info {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
        }

        .info-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--text-secondary);
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 6px;
          padding: 6px 12px;
        }

        .charts-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          min-width: 0;
        }

        .chart-container {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 8px;
          padding: 16px;
          overflow: hidden;
          min-width: 0;
        }

        .chart-label {
          font-family: var(--font-mono);
          font-size: clamp(9px, 2.5vw, 11px);
          color: var(--text-secondary);
          margin-bottom: 12px;
          letter-spacing: 0.06em;
        }

        .impact-table-container {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 8px;
          padding: 16px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        .impact-table-header {
          font-family: var(--font-mono);
          font-size: clamp(9px, 2.5vw, 11px);
          color: var(--text-secondary);
          margin-bottom: 14px;
          letter-spacing: 0.06em;
        }

        .impact-table-body {
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 320px;
        }

        .impact-row {
          display: grid;
          grid-template-columns: minmax(120px, 180px) 1fr minmax(60px, 80px);
          gap: 12px;
          align-items: center;
          padding: 10px 14px;
          border-radius: 6px;
          background: var(--bg-elevated);
          min-width: 0;
        }

        .impact-condition {
          font-family: var(--font-mono);
          font-size: clamp(9px, 2.2vw, 10px);
          color: var(--text-primary);
          word-break: break-word;
        }

        .impact-description {
          font-family: var(--font-mono);
          font-size: clamp(9px, 2.2vw, 10px);
          color: var(--text-secondary);
          word-break: break-word;
        }

        .impact-severity {
          font-family: var(--font-mono);
          font-size: clamp(8px, 2vw, 9px);
          letter-spacing: 0.06em;
          text-align: right;
          text-transform: uppercase;
          white-space: nowrap;
        }

        @media (max-width: 1024px) {
          .weather-cards-grid {
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
          }

          .charts-grid {
            grid-template-columns: 1fr;
            gap: 12px;
          }
        }

        @media (max-width: 768px) {
          .weather-cards-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
          }

          .header-top {
            flex-direction: column;
          }

          .charts-grid {
            grid-template-columns: 1fr;
            gap: 12px;
          }

          .impact-row {
            grid-template-columns: 1fr;
            gap: 6px;
            padding: 12px;
          }

          .impact-severity {
            text-align: left;
            margin-top: 4px;
          }

          .chart-container {
            padding: 12px;
          }
        }

        @media (max-width: 480px) {
          .weather-cards-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
          }

          .weather-analysis {
            gap: 12px;
          }

          .extra-info {
            gap: 8px;
          }

          .info-item {
            font-size: 10px;
            padding: 4px 8px;
          }
        }

        @media (max-width: 360px) {
          .weather-cards-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 6px;
          }
        }
      `}</style>
    </div>
  );
}
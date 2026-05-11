/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Polyline, useMap, ZoomControl } from 'react-leaflet';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { 
  Upload, 
  Map as MapIcon, 
  Calendar, 
  Route, 
  Info, 
  Filter,
  Layers,
  ChevronRight,
  MapPin,
  Trash2,
  FileJson,
  Plus,
  Minus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { LocationPoint, parseLocationHistory, calculateTotalDistance, calculateAverageSpeed } from './utils/geo';
import L from 'leaflet';

// Fix for default marker icons in Leaflet with React
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function getSpeedColor(speedH: number): string {
  if (speedH <= 5) return '#3b82f6'; // Blue (Slow)
  if (speedH <= 20) return '#06b6d4'; // Cyan
  if (speedH <= 50) return '#10b981'; // Green
  if (speedH <= 80) return '#f59e0b'; // Amber
  return '#ef4444'; // Red (Fast)
}

// --- Components ---

function FitBounds({ points }: { points: LocationPoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (map && points.length > 0) {
      const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, points]);

  return null;
}

function MapController({ selectedPoint }: { selectedPoint: LocationPoint | null }) {
  const map = useMap();

  useEffect(() => {
    if (selectedPoint && map) {
      map.panTo([selectedPoint.lat, selectedPoint.lng]);
      if (map.getZoom() < 15) {
        map.setZoom(15);
      }
    }
  }, [selectedPoint, map]);

  return null;
}

function MapInvalidator() {
  const map = useMap();
  useEffect(() => {
    // Small delay to ensure the container transition is finished
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

function PolylineDisplay({ points }: { points: LocationPoint[] }) {
  if (points.length < 2) return null;

  // For performance, we'll draw segments.
  // Optimization: Only draw if points count is manageable
  const step = points.length > 3000 ? Math.ceil(points.length / 3000) : 1;
  const segments = [];

  for (let i = 0; i < points.length - 1; i += step) {
    const p1 = points[i];
    const p2 = points[Math.min(i + step, points.length - 1)];
    const speed = p1.speedKmH ?? 0;
    
    segments.push(
      <Polyline
        key={i}
        positions={[
          [p1.lat, p1.lng],
          [p2.lat, p2.lng]
        ]}
        pathOptions={{
          color: getSpeedColor(speed),
          opacity: 0.9,
          weight: 4,
          lineJoin: 'round'
        }}
      />
    );
  }

  return <>{segments}</>;
}

// --- Inner Map UI ---

function MapContent({ 
  rawData, 
  setRawData, 
  isDragging, 
  setIsDragging, 
  startDate, 
  setStartDate, 
  endDate, 
  setEndDate, 
  selectedPoint, 
  setSelectedPoint,
  handleFileUpload,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  filteredData,
  totalDistance,
  averageSpeed
}: any) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 font-sans text-slate-800">
      {/* Sidebar: Controls & Stats */}
      <aside className="w-80 bg-white border-r border-slate-200 flex flex-col shadow-sm z-10">
        <header className="p-6 border-b border-slate-100">
          <h1 className="text-xl font-bold tracking-tight text-blue-600">Geo Timeline</h1>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-semibold italic">OpenStreetMap History</p>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {/* File Drop Zone (Mini Version) */}
          {rawData.length > 0 && (
            <div className="px-6 py-4">
              <label className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center hover:border-blue-400 transition-colors bg-slate-50 cursor-pointer flex flex-col items-center">
                <Upload className="w-5 h-5 text-slate-400 mb-1" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Update JSON</p>
                <input 
                  type="file" 
                  accept=".json" 
                  className="hidden" 
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }} 
                />
              </label>
            </div>
          )}

          {/* Filters */}
          <section className="px-6 py-6 space-y-6 text-slate-600">
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400 mb-3 block tracking-widest">Period Filter</label>
              <div className="space-y-3">
                <div className="relative group">
                  <span className="absolute left-3 top-2.5 text-[9px] uppercase font-black text-slate-300 group-focus-within:text-blue-500 transition-colors">From</span>
                  <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full pl-12 pr-3 py-2 text-sm border border-slate-200 rounded bg-slate-50 font-mono focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" 
                  />
                </div>
                <div className="relative group">
                  <span className="absolute left-3 top-2.5 text-[9px] uppercase font-black text-slate-300 group-focus-within:text-blue-500 transition-colors">To</span>
                  <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full pl-12 pr-3 py-2 text-sm border border-slate-200 rounded bg-slate-50 font-mono focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" 
                  />
                </div>
                { (startDate || endDate) && (
                  <button 
                    onClick={() => { setStartDate(''); setEndDate(''); }}
                    className="w-full text-[9px] text-center font-bold text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-widest cursor-pointer"
                  >
                    Clear Filter
                  </button>
                )}
              </div>
            </div>

            {/* Point Selection List in Sidebar */}
            {filteredData.length > 0 && (
              <div className="pt-4 border-t border-slate-50">
                <label className="text-[10px] uppercase font-bold text-slate-400 mb-3 block tracking-widest">Recent Records</label>
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                  {filteredData.slice(0, 30).map((p: any, i: number) => (
                    <button 
                      key={i}
                      onClick={() => setSelectedPoint(p)}
                      className={cn(
                        "w-full px-3 py-2 text-left rounded border transition-all flex items-center justify-between group",
                        selectedPoint === p 
                          ? "bg-blue-50 border-blue-200" 
                          : "bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50"
                      )}
                    >
                      <div>
                        <p className="text-[10px] font-mono font-bold leading-none">{format(p.timestamp, 'HH:mm:ss')}</p>
                        <p className="text-[9px] text-slate-400 uppercase mt-0.5">{format(p.timestamp, 'MMM dd')}</p>
                      </div>
                      <ChevronRight className={cn(
                         "w-3 h-3 text-slate-300 transition-transform",
                         selectedPoint === p && "text-blue-500 translate-x-0.5"
                      )} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Statistics Section: Activity Summary */}
        <section className="mt-auto border-t border-slate-100 p-6 bg-slate-50/50">
          <label className="text-[10px] uppercase font-bold text-slate-400 mb-4 block tracking-widest">Activity Summary</label>
          
          <div className="space-y-4 text-slate-800">
            <div className="flex justify-between items-end">
              <div>
                <p className="text-2xl font-light text-slate-900 tracking-tight">
                  {totalDistance.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                  <span className="text-sm font-semibold ml-1">km</span>
                </p>
                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mt-0.5">Total Distance</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-light text-slate-900 tracking-tight">
                  {averageSpeed.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                  <span className="text-sm font-semibold ml-1">km/h</span>
                </p>
                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mt-0.5">Avg Speed</p>
              </div>
            </div>
            
            <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden flex shadow-inner">
              <div className="h-full bg-blue-500 w-[20%]"></div>
              <div className="h-full bg-cyan-400 w-[20%]"></div>
              <div className="h-full bg-emerald-400 w-[20%]"></div>
              <div className="h-full bg-amber-400 w-[20%]"></div>
              <div className="h-full bg-red-500 w-[20%]"></div>
            </div>
            
            <div className="flex justify-between px-1">
               <span className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter">0 km/h</span>
               <span className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter">80+ km/h</span>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span> Slow / Stay
              </div>
              <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-red-500"></span> Fast / Travel
              </div>
            </div>
          </div>

          {rawData.length > 0 && (
            <button 
              onClick={() => { setRawData([]); setStartDate(''); setEndDate(''); setSelectedPoint(null); }}
              className="mt-6 w-full py-2 flex items-center justify-center gap-2 text-slate-400 hover:text-red-500 transition-colors text-[10px] font-black uppercase tracking-widest border border-slate-100 hover:border-red-100 rounded bg-white hover:bg-red-50"
            >
              <Trash2 className="w-3 h-3" />
              Reset All Data
            </button>
          ) }
        </section>
      </aside>

      {/* Main Content: Map Interface */}
      <main className="flex-1 relative flex flex-col bg-[#e5e7eb]">
        {/* Map Toolbar Overlay */}
        <div className="absolute top-6 left-6 z-[1000] flex gap-2">
          <div className="px-4 py-2 bg-white shadow-md rounded-md text-[10px] font-black uppercase tracking-widest border border-slate-200 flex items-center gap-2">
            <span className={cn(
              "w-2 h-2 rounded-full",
              rawData.length > 0 ? "bg-emerald-500 animate-pulse" : "bg-slate-300"
            )}></span>
            {rawData.length > 0 ? 'Visualization Active' : 'Standby'}
          </div>
        </div>

        <MapContainer
          center={[35.681236, 139.767125]} // Tokyo
          zoom={12}
          zoomControl={false}
          style={{ width: '100%', height: '100%', background: '#f8fafc' }}
          className="z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ZoomControl position="topright" />
          <MapController selectedPoint={selectedPoint} />
          <MapInvalidator />
          {filteredData.length > 0 && (
            <>
              <PolylineDisplay points={filteredData} />
              <FitBounds points={filteredData} />
            </>
          )}
        </MapContainer>

        {/* Global Overlays */}
        <AnimatePresence>
          {rawData.length === 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={cn(
                "absolute inset-0 z-[2000] flex items-center justify-center bg-slate-50/90 backdrop-blur-sm p-6 focus-within:ring-0",
                isDragging && "bg-blue-50/95"
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className={cn(
                "max-w-md w-full border-2 border-dashed rounded-xl p-12 transition-all flex flex-col items-center text-center",
                isDragging 
                  ? "border-blue-500 bg-blue-100/50 scale-102" 
                  : "border-slate-200 bg-white shadow-xl"
              )}>
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-8 relative border border-slate-100">
                   <Upload className="w-10 h-10 text-slate-400 relative z-10" />
                </div>
                <h2 className="text-2xl font-black text-slate-900 mb-3 tracking-tighter uppercase">GEOJSON VOYAGER</h2>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-10 leading-relaxed max-w-xs mx-auto">
                  Drop your location history JSON file here to begin structural analysis.
                </p>
                <div className="flex flex-col gap-4 w-full">
                  <label className="cursor-pointer bg-blue-600 text-white px-8 py-4 rounded font-black text-[10px] tracking-widest uppercase hover:bg-blue-700 hover:-translate-y-0.5 transition-all active:translate-y-0 shadow-lg shadow-blue-500/20 text-center">
                    <span>Initialize Data Import</span>
                    <input 
                      type="file" 
                      accept=".json" 
                      className="hidden" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                      }} 
                    />
                  </label>
                </div>
                <div className="mt-10 pt-10 border-t border-slate-50 w-full flex items-center justify-center gap-4 opacity-50">
                   <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-tighter text-slate-400">
                      <FileJson className="w-3 h-3" /> Takeout Format
                   </div>
                   <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-tighter text-slate-400">
                      <Layers className="w-3 h-3" /> Timeline JSON
                   </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Selected Point Floating Card */}
        {selectedPoint && (
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-sm px-6"
          >
            <div className="bg-white/95 backdrop-blur-md rounded border border-slate-200 shadow-2xl p-5">
              <div className="flex items-start justify-between mb-4 text-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-100 rounded border border-slate-200">
                    <MapPin className="w-4 h-4 text-slate-600" />
                  </div>
                  <div>
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Geolocation Point</h3>
                    <p className="text-xs font-mono font-bold text-slate-900">{format(selectedPoint.timestamp, 'yyyy-MM-dd HH:mm:ss')}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedPoint(null)}
                  className="p-1 hover:bg-slate-100 rounded transition-colors"
                >
                  <ChevronRight className="w-4 h-4 rotate-90 text-slate-400" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-px bg-slate-100 border border-slate-100 rounded-sm overflow-hidden text-slate-800">
                <div className="bg-white p-3">
                  <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1">LATITUDE</p>
                  <p className="font-mono text-[11px] font-bold">{selectedPoint.lat.toFixed(6)}°N</p>
                </div>
                <div className="bg-white p-3">
                  <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1">LONGITUDE</p>
                  <p className="font-mono text-[11px] font-bold">{selectedPoint.lng.toFixed(6)}°E</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}

// --- Main App ---

export default function App() {
  const [rawData, setRawData] = useState<LocationPoint[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedPoint, setSelectedPoint] = useState<LocationPoint | null>(null);

  const filteredData = useMemo(() => {
    if (!rawData.length) return [];
    if (!startDate && !endDate) return rawData;

    try {
      return rawData.filter(p => {
        const start = startDate ? startOfDay(new Date(startDate)) : null;
        const end = endDate ? endOfDay(new Date(endDate)) : null;

        if (start && end) return isWithinInterval(p.timestamp, { start, end });
        if (start) return p.timestamp >= start;
        if (end) return p.timestamp <= end;
        return true;
      });
    } catch (err) {
      console.error('Filtering error:', err);
      return rawData;
    }
  }, [rawData, startDate, endDate]);

  const totalDistance = useMemo(() => calculateTotalDistance(filteredData), [filteredData]);
  const averageSpeed = useMemo(() => calculateAverageSpeed(filteredData), [filteredData]);

  const handleFileUpload = useCallback((file: File) => {
    console.log('Processing file:', file.name, 'Size:', file.size, 'Type:', file.type);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const content = JSON.parse(text);
        const parsed = parseLocationHistory(content);
        
        if (parsed.length === 0) {
          alert('解析可能な位置データが見見つかりませんでした。ファイル形式を確認してください。');
          return;
        }

        setRawData(parsed);
        // Set initial dates from data
        if (parsed.length > 0) {
          setStartDate(format(parsed[0].timestamp, 'yyyy-MM-dd'));
          setEndDate(format(parsed[parsed.length - 1].timestamp, 'yyyy-MM-dd'));
        }
      } catch (err) {
        console.error('Upload error:', err);
        alert('JSONの解析に失敗しました。ファイルが破損しているか、形式が正しくありません。');
      }
    };
    reader.onerror = () => alert('ファイルの読み込み中にエラーが発生しました。');
    reader.readAsText(file);
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    
    // Improved extension check
    const isJson = file && (file.type === 'application/json' || file.name.toLowerCase().endsWith('.json'));
    
    if (isJson) {
      handleFileUpload(file);
    } else {
      alert('JSONファイルをドロップしてください。');
    }
  };

  return (
    <>
      <MapContent 
        rawData={rawData}
        setRawData={setRawData}
        isDragging={isDragging}
        setIsDragging={setIsDragging}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
        selectedPoint={selectedPoint}
        setSelectedPoint={setSelectedPoint}
        handleFileUpload={handleFileUpload}
        handleDragOver={handleDragOver}
        handleDragLeave={handleDragLeave}
        handleDrop={handleDrop}
        filteredData={filteredData}
        totalDistance={totalDistance}
        averageSpeed={averageSpeed}
      />
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
        
        input[type="date"]::-webkit-calendar-picker-indicator {
          background: transparent;
          bottom: 0;
          color: transparent;
          cursor: pointer;
          height: auto;
          left: 0;
          position: absolute;
          right: 0;
          top: 0;
          width: auto;
        }

        .leaflet-container {
          width: 100%;
          height: 100%;
          z-index: 0;
        }
      `}</style>
    </>
  );
}

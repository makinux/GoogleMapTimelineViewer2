/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Polyline, useMap, ZoomControl, Marker, Popup } from 'react-leaflet';
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
  Minus,
  Image as ImageIcon,
  LogOut,
  ExternalLink,
  Play,
  Pause,
  RotateCcw,
  CarFront,
  Bike as BikeIcon,
  PersonStanding,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { LocationPoint, parseLocationHistory, calculateTotalDistance, calculateAverageSpeed } from './utils/geo';
import L from 'leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import exifr from 'exifr';

// Fixed PhotoItem interface for local data
interface PhotoItem {
  id: string;
  url: string; // Blob URL
  filename: string;
  creationTime?: string;
  cameraModel?: string;
  iso?: number;
  aperture?: string;
  exposureTime?: string;
  location: {
    latitude: number;
    longitude: number;
  };
}

type VehicleType = 'walking' | 'bike' | 'motorcycle' | 'car';

// --- Components ---

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

function FitBounds({ points, photos }: { points: LocationPoint[]; photos: PhotoItem[] }) {
  const map = useMap();

  useEffect(() => {
    if (map) {
      if (points.length > 0 || photos.length > 0) {
        const bounds = L.latLngBounds([]);
        points.forEach(p => bounds.extend([p.lat, p.lng]));
        photos.forEach(p => bounds.extend([p.location.latitude, p.location.longitude]));
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [map, points, photos]);

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

function PhotoMarker({ photo }: { photo: PhotoItem; key?: string }) {
  const customIcon = L.divIcon({
    html: `
      <div class="relative w-10 h-10 border-2 border-white rounded shadow-lg overflow-hidden bg-slate-200">
        <img src="${photo.url}" class="w-full h-full object-cover" />
      </div>
    `,
    className: '',
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40]
  });

  return (
    <Marker position={[photo.location.latitude, photo.location.longitude]} icon={customIcon}>
      <Popup className="photo-popup">
        <div className="p-1 max-w-[300px]">
          <div className="relative aspect-video mb-2 rounded overflow-hidden bg-slate-100">
            <img 
              src={photo.url} 
              alt={photo.filename} 
              className="w-full h-full object-contain cursor-pointer"
              onClick={() => window.open(photo.url, '_blank')}
            />
          </div>
          <div className="px-1">
            <p className="text-[10px] font-bold text-slate-800 break-all">{photo.filename}</p>
            {photo.creationTime && (
              <div className="flex items-center gap-1.5 mt-1 text-slate-400">
                 <Calendar className="w-3 h-3" />
                 <span className="text-[10px] font-mono leading-none">
                   {format(new Date(photo.creationTime), 'yyyy-MM-dd HH:mm')}
                 </span>
              </div>
            )}
            {(photo.cameraModel || photo.iso || photo.aperture) && (
              <div className="mt-3 pt-2 border-t border-slate-100 flex gap-4 text-[9px] text-slate-500 font-medium whitespace-nowrap">
                {photo.cameraModel && (
                  <div>
                    <p className="text-[8px] text-slate-300 font-black uppercase tracking-widest mb-0.5">CAMERA</p>
                    <p>{photo.cameraModel}</p>
                  </div>
                )}
                {photo.iso && (
                  <div>
                    <p className="text-[8px] text-slate-300 font-black uppercase tracking-widest mb-0.5">ISO</p>
                    <p>{photo.iso}</p>
                  </div>
                )}
                {photo.aperture && (
                  <div>
                    <p className="text-[8px] text-slate-300 font-black uppercase tracking-widest mb-0.5">APERTURE</p>
                    <p>{photo.aperture}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

function PlaybackMarker({ position, vehicleType }: { position: [number, number], vehicleType: VehicleType }) {
  const iconHtml = (() => {
    switch (vehicleType) {
      case 'walking': return '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-person-standing"><circle cx="12" cy="5" r="1"/><path d="m9 20 3-6 3 6"/><path d="m6 8 6 2 6-2"/><path d="M12 10v4"/></svg>';
      case 'bike': return '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bike"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>';
      case 'motorcycle': return '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-zap"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
      case 'car': return '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-car-front"><path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.64 5H8.36a2 2 0 0 0-1.86 1.3L5 10l-2-2"/><path d="M2 14h20"/><path d="M4 18v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-2"/><path d="M17 18v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-2"/><rect width="20" height="8" x="2" y="10" rx="2"/><circle cx="6.5" cy="14" r=".5"/><circle cx="17.5" cy="14" r=".5"/></svg>';
    }
  })();

  const icon = L.divIcon({
    html: `
      <div class="flex items-center justify-center w-8 h-8 rounded-full border-2 border-white shadow-xl bg-blue-600 text-white transform transition-transform duration-300">
        ${iconHtml}
      </div>
    `,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

  return <Marker position={position} icon={icon} zIndexOffset={2000} />;
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
  handlePhotoUpload,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  filteredData,
  totalDistance,
  averageSpeed,
  photos,
  setPhotos,
  isSyncing,
  currentTime,
  setCurrentTime,
  isPlaying,
  setIsPlaying,
  playbackSpeed,
  setPlaybackSpeed,
  vehicleType,
  setVehicleType,
  currentPosition
}: any) {
  const minTime = filteredData.length > 0 ? filteredData[0].timestamp.getTime() : 0;
  const maxTime = filteredData.length > 0 ? filteredData[filteredData.length - 1].timestamp.getTime() : 0;
  const duration = maxTime - minTime;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentTime(parseInt(e.target.value));
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 font-sans text-slate-800">
      {/* Sidebar: Controls & Stats */}
      <aside className="w-80 bg-white border-r border-slate-200 flex flex-col shadow-sm z-10 transition-all">
        <header className="p-6 border-b border-slate-100">
          <h1 className="text-xl font-bold tracking-tight text-blue-600">Geo Timeline</h1>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-semibold italic">Local Assets Analysis</p>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {/* Time Controller (New) */}
          {filteredData.length > 0 && (
            <div className="px-6 py-6 border-b border-slate-50 bg-blue-50/20">
              <label className="text-[10px] uppercase font-bold text-slate-400 mb-4 block tracking-widest flex items-center justify-between">
                <span className="flex items-center gap-2"><Play className="w-3 h-3" /> Timeline Playback</span>
                {isPlaying && <span className="text-blue-500 animate-pulse lowercase font-mono">playing {playbackSpeed}x</span>}
              </label>

              <div className="space-y-6">
                {/* Time Range Info */}
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[9px] font-mono text-slate-400">{format(new Date(currentTime), 'HH:mm:ss')}</span>
                  <span className="text-[9px] font-mono text-slate-400">{format(maxTime, 'HH:mm:ss')}</span>
                </div>

                {/* Slider */}
                <div className="relative group">
                  <input 
                    type="range"
                    min={minTime}
                    max={maxTime}
                    value={currentTime}
                    onChange={handleSliderChange}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <div 
                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white border-2 border-blue-600 rounded-full pointer-events-none transform -translate-x-1/2 shadow-sm"
                    style={{ left: `${((currentTime - minTime) / (duration || 1)) * 100}%` }}
                  />
                </div>

                {/* Playback Actions */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setIsPlaying(!isPlaying)}
                      className={cn(
                        "w-10 h-10 flex items-center justify-center rounded-full shadow-md transition-all",
                        isPlaying ? "bg-slate-800 text-white" : "bg-blue-600 text-white"
                      )}
                    >
                      {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                    </button>
                    <button 
                      onClick={() => setCurrentTime(minTime)}
                      className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Vehicle Selector */}
                  <div className="flex bg-white border border-slate-200 rounded-full p-1 shadow-sm">
                    {[
                      { id: 'walking', icon: <PersonStanding className="w-3.5 h-3.5" /> },
                      { id: 'bike', icon: <BikeIcon className="w-3.5 h-3.5" /> },
                      { id: 'motorcycle', icon: <Zap className="w-3.5 h-3.5" /> },
                      { id: 'car', icon: <CarFront className="w-3.5 h-3.5" /> }
                    ].map((v) => (
                      <button
                        key={v.id}
                        onClick={() => setVehicleType(v.id as VehicleType)}
                        className={cn(
                          "w-8 h-8 flex items-center justify-center rounded-full transition-colors",
                          vehicleType === v.id ? "bg-blue-100 text-blue-600" : "text-slate-400 hover:text-slate-600"
                        )}
                      >
                        {v.icon}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Speed Controls */}
                <div className="flex items-center gap-3">
                   <div className="flex-1 flex gap-1">
                      {[1, 10, 100, 1000].map(s => (
                        <button 
                          key={s}
                          onClick={() => setPlaybackSpeed(s)}
                          className={cn(
                            "flex-1 py-1 rounded text-[9px] font-black uppercase tracking-tighter border transition-all",
                            playbackSpeed === s ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-400"
                          )}
                        >
                          x{s}
                        </button>
                      ))}
                   </div>
                   <div className="w-14 relative">
                      <input 
                        type="number"
                        value={playbackSpeed}
                        onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value) || 1)}
                        className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[10px] font-mono text-center outline-none focus:ring-1 focus:ring-blue-500"
                      />
                   </div>
                </div>
              </div>
            </div>
          )}
          {/* Photos Integration Section */}
          <div className="px-6 py-6 border-b border-slate-50 bg-slate-50/30">
            <label className="text-[10px] uppercase font-bold text-slate-400 mb-4 block tracking-widest flex items-center gap-2">
              <ImageIcon className="w-3 h-3" /> Photo Import
            </label>
            
            <div className="space-y-4">
              {photos.length > 0 && (
                <div className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-emerald-50 rounded-full flex items-center justify-center">
                      <ImageIcon className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-900 uppercase">Loaded Photos</p>
                      <p className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest">{photos.length} GPS Points</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      photos.forEach((p: any) => URL.revokeObjectURL(p.url));
                      setPhotos([]);
                    }}
                    className="p-1.5 hover:bg-slate-100 rounded text-slate-400 transition-colors"
                    title="Clear Photos"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <label className={cn(
                "w-full flex items-center justify-center gap-2.5 px-4 py-3 bg-blue-600 rounded font-black text-[10px] uppercase tracking-widest text-white hover:bg-blue-700 transition-all shadow-sm active:translate-y-px cursor-pointer",
                isSyncing && "animate-pulse opacity-50"
              )}>
                <Plus className="w-3.5 h-3.5" />
                {isSyncing ? 'Processing...' : 'Add Local Photos'}
                <input 
                  type="file" 
                  multiple 
                  accept="image/*" 
                  className="hidden" 
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length) handlePhotoUpload(files);
                  }}
                />
              </label>
              <p className="text-[8px] text-slate-400 text-center leading-normal">
                Select photos with GPS metadata. <br/>
                They stay completely on your browser.
              </p>
            </div>
          </div>

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
              rawData.length > 0 || photos.length > 0 ? "bg-emerald-500 animate-pulse" : "bg-slate-300"
            )}></span>
            {rawData.length > 0 || photos.length > 0 ? 'Visualization Active' : 'Standby'}
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
              <FitBounds points={filteredData} photos={photos} />
              {currentPosition && <PlaybackMarker position={currentPosition as [number, number]} vehicleType={vehicleType} />}
            </>
          )}

          {photos.length > 0 && (
            // @ts-ignore
            <MarkerClusterGroup chunkedLoading={true}>
              {photos.map((photo: PhotoItem) => (
                <PhotoMarker key={photo.id} photo={photo} />
              ))}
            </MarkerClusterGroup>
          )}
        </MapContainer>

        {/* Global Overlays */}
        <AnimatePresence>
          {rawData.length === 0 && photos.length === 0 && (
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
                <h2 className="text-2xl font-black text-slate-900 mb-3 tracking-tighter uppercase">GEO VOYAGER</h2>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-10 leading-relaxed max-w-xs mx-auto">
                  Drop your location JSON or Photos (with GPS) here to begin analysis.
                </p>
                <div className="flex flex-col gap-4 w-full">
                  <label className="cursor-pointer bg-blue-600 text-white px-8 py-4 rounded font-black text-[10px] tracking-widest uppercase hover:bg-blue-700 hover:-translate-y-0.5 transition-all active:translate-y-0 shadow-lg shadow-blue-500/20 text-center">
                    <span>Initialize Data Import</span>
                    <input 
                      type="file" 
                      multiple
                      accept=".json,image/*" 
                      className="hidden" 
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []) as File[];
                        const json = files.find(f => f.name.toLowerCase().endsWith('.json'));
                        const images = files.filter(f => f.type.startsWith('image/'));
                        if (json) handleFileUpload(json);
                        if (images.length) handlePhotoUpload(images);
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
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // Playback State
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [vehicleType, setVehicleType] = useState<VehicleType>('car');

  const filteredData = useMemo(() => {
    if (!rawData.length) return [];
    if (!startDate && !endDate) return rawData;

    try {
      const filtered = rawData.filter(p => {
        const start = startDate ? startOfDay(new Date(startDate)) : null;
        const end = endDate ? endOfDay(new Date(endDate)) : null;

        if (start && end) return isWithinInterval(p.timestamp, { start, end });
        if (start) return p.timestamp >= start;
        if (end) return p.timestamp <= end;
        return true;
      });
      return filtered;
    } catch (err) {
      console.error('Filtering error:', err);
      return rawData;
    }
  }, [rawData, startDate, endDate]);

  // Sync currentTime to start of filtered data when data changes or bounds change
  useEffect(() => {
    if (filteredData.length > 0) {
      const min = filteredData[0].timestamp.getTime();
      const max = filteredData[filteredData.length - 1].timestamp.getTime();
      if (currentTime < min || currentTime > max) {
        setCurrentTime(min);
      }
    } else {
      setCurrentTime(0);
    }
  }, [filteredData]); // Removed currentTime from deps to avoid loop; logic handles it

  // Animation Frame Loop
  useEffect(() => {
    let lastTime = Date.now();
    let animationFrame: number;

    const tick = () => {
      if (isPlaying) {
        const now = Date.now();
        const delta = now - lastTime;
        lastTime = now;

        setCurrentTime(prev => {
          const next = prev + (delta * playbackSpeed);
          const maxTime = filteredData.length > 0 ? filteredData[filteredData.length - 1].timestamp.getTime() : 0;
          
          if (next >= maxTime) {
            setIsPlaying(false);
            return maxTime;
          }
          return next;
        });
      } else {
        lastTime = Date.now();
      }
      animationFrame = requestAnimationFrame(tick);
    };

    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [isPlaying, playbackSpeed, filteredData]);

  const currentPosition = useMemo(() => {
    if (!filteredData.length) return null;
    
    // Find the two points currentTime is between
    const time = currentTime;
    let p1 = filteredData[0];
    let p2 = filteredData[filteredData.length - 1];

    if (time <= p1.timestamp.getTime()) return [p1.lat, p1.lng];
    if (time >= p2.timestamp.getTime()) return [p2.lat, p2.lng];

    // Binary search for efficiency
    let low = 0;
    let high = filteredData.length - 1;
    let p1Idx = 0;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (filteredData[mid].timestamp.getTime() <= time) {
        p1Idx = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    p1 = filteredData[p1Idx];
    p2 = filteredData[Math.min(p1Idx + 1, filteredData.length - 1)];

    if (p1 === p2) return [p1.lat, p1.lng];

    // Linear interpolation
    const t1 = p1.timestamp.getTime();
    const t2 = p2.timestamp.getTime();
    const ratio = (time - t1) / (t2 - t1);

    return [
      p1.lat + (p2.lat - p1.lat) * ratio,
      p1.lng + (p2.lng - p1.lng) * ratio
    ];
  }, [filteredData, currentTime]);

  const handlePhotoUpload = async (files: File[]) => {
    setIsSyncing(true);
    let successCount = 0;
    let failCount = 0;

    const newPhotos: PhotoItem[] = [];

    for (const file of files) {
      try {
        const metadata: any = await exifr.parse(file, {
          gps: true,
          tiff: true,
          ifd0: true,
          exif: true
        } as any);

        if (metadata && metadata.latitude && metadata.longitude) {
          const photo: PhotoItem = {
            id: `${file.name}-${file.lastModified}-${Math.random()}`,
            url: URL.createObjectURL(file),
            filename: file.name,
            creationTime: metadata.DateTimeOriginal?.toISOString() || metadata.CreateDate?.toISOString(),
            cameraModel: metadata.Model,
            iso: metadata.ISO,
            aperture: metadata.FNumber ? `f/${metadata.FNumber}` : undefined,
            location: {
              latitude: metadata.latitude,
              longitude: metadata.longitude
            }
          };
          newPhotos.push(photo);
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        console.error(`Error parsing ${file.name}:`, err);
        failCount++;
      }
    }

    setPhotos(prev => [...prev, ...newPhotos]);
    setIsSyncing(false);

    if (failCount > 0) {
      console.warn(`${failCount} files were skipped (no GPS metadata or invalid format).`);
    }
  };

  const totalDistance = useMemo(() => calculateTotalDistance(filteredData), [filteredData]);
  const averageSpeed = useMemo(() => calculateAverageSpeed(filteredData), [filteredData]);

  const handleFileUpload = useCallback((file: File) => {
    console.log('Starting file analysis:', file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const content = JSON.parse(text);
        const parsed = parseLocationHistory(content);
        
        if (parsed.length === 0) {
          alert('解析可能な位置データが見つかりませんでした。ファイル形式（Google Takeoutなど）を確認してください。');
          return;
        }

        setRawData(parsed);
        
        // Auto-set dates if not already set, using functional updates for stability
        setStartDate((prev) => {
          if (!prev && parsed.length > 0) return format(parsed[0].timestamp, 'yyyy-MM-dd');
          return prev;
        });
        setEndDate((prev) => {
          if (!prev && parsed.length > 0) return format(parsed[parsed.length - 1].timestamp, 'yyyy-MM-dd');
          return prev;
        });
        
        console.log('File analysis complete. Points:', parsed.length);
      } catch (err) {
        console.error('Upload error:', err);
        alert('JSONの解析に失敗しました。');
      }
    };
    reader.onerror = () => alert('ファイルの読み込み中にエラーが発生しました。');
    reader.readAsText(file);
  }, []); // Removed dependencies for stability

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
    
    const files = Array.from(e.dataTransfer.files) as File[];
    
    const jsonFiles = files.filter(f => f.type === 'application/json' || f.name.toLowerCase().endsWith('.json'));
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    
    if (jsonFiles.length > 0) {
      handleFileUpload(jsonFiles[0]);
    }
    
    if (imageFiles.length > 0) {
      handlePhotoUpload(imageFiles);
    }

    if (jsonFiles.length === 0 && imageFiles.length === 0) {
      alert('JSONまたは画像ファイルをドロップしてください。');
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
        handlePhotoUpload={handlePhotoUpload}
        handleDragOver={handleDragOver}
        handleDragLeave={handleDragLeave}
        handleDrop={handleDrop}
        filteredData={filteredData}
        totalDistance={totalDistance}
        averageSpeed={averageSpeed}
        photos={photos}
        setPhotos={setPhotos}
        isSyncing={isSyncing}
        currentTime={currentTime}
        setCurrentTime={setCurrentTime}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        playbackSpeed={playbackSpeed}
        setPlaybackSpeed={setPlaybackSpeed}
        vehicleType={vehicleType}
        setVehicleType={setVehicleType}
        currentPosition={currentPosition}
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

        .photo-popup .leaflet-popup-content-wrapper {
          padding: 0;
          overflow: hidden;
          border-radius: 8px;
        }
        .photo-popup .leaflet-popup-content {
          margin: 0;
          width: auto !important;
        }
        .photo-popup .leaflet-popup-close-button {
          color: white;
          background: rgba(0,0,0,0.5);
          border-radius: 50%;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          top: 8px;
          right: 8px;
        }
      `}</style>
    </>
  );
}

/**
 * Utility functions for geographic calculations and parsing
 */

export interface LocationPoint {
  timestamp: Date;
  lat: number;
  lng: number;
  accuracy?: number;
  speedKmH?: number; // Estimated speed to next point
}

/**
 * Calculates the distance between two points in kilometers using the Haversine formula
 */
export function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Parses a "lat, lng" string like "39.6881393°, 141.134204°"
 */
function parseLatLngString(str: string): { lat: number; lng: number } | null {
  if (!str) return null;
  const parts = str.split(',').map(p => p.trim().replace('°', ''));
  if (parts.length === 2) {
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (!isNaN(lat) && !isNaN(lng)) {
      return { lat, lng };
    }
  }
  return null;
}

/**
 * Parses Google Location History JSON
 * Handles standard "locations" array format and various field name iterations
 */
export function parseLocationHistory(json: any): LocationPoint[] {
  let locations: LocationPoint[] = [];

  console.log('Parsing JSON structure:', json ? Object.keys(json) : 'null');

  if (json && Array.isArray(json.locations)) {
    console.log(`Found ${json.locations.length} points in standard format`);
    for (const loc of json.locations) {
      // Handle various timestamp formats (timestampMs, timestampISO, etc.)
      const tsValue = loc.timestampMs || loc.timestamp || loc.time;
      const lat = loc.latitudeE7 ?? loc.latE7;
      const lng = loc.longitudeE7 ?? loc.lngE7;

      if (lat != null && lng != null && tsValue != null) {
        // Convert timestamp to Date object
        const timestamp = new Date(
          typeof tsValue === 'string' && !isNaN(Number(tsValue)) 
            ? Number(tsValue) 
            : tsValue
        );
        
        if (!isNaN(timestamp.getTime())) {
          locations.push({
            timestamp,
            lat: lat / 1e7,
            lng: lng / 1e7,
            accuracy: loc.accuracy,
          });
        }
      }
    }
  } else if (json && Array.isArray(json.timelineObjects)) {
    console.log(`Found ${json.timelineObjects.length} timeline objects`);
    for (const obj of json.timelineObjects) {
      if (obj.placeVisit) {
        const loc = obj.placeVisit.location;
        const tsValue = obj.placeVisit.duration?.startTimestamp;
        if (loc?.latitudeE7 && loc?.longitudeE7 && tsValue) {
          locations.push({
            timestamp: new Date(tsValue),
            lat: loc.latitudeE7 / 1e7,
            lng: loc.longitudeE7 / 1e7,
          });
        }
      } else if (obj.activitySegment) {
        const start = obj.activitySegment.startLocation;
        const end = obj.activitySegment.endLocation;
        const startTs = obj.activitySegment.duration?.startTimestamp;
        const endTs = obj.activitySegment.duration?.endTimestamp;

        if (start?.latitudeE7 && startTs) {
          locations.push({
            timestamp: new Date(startTs),
            lat: start.latitudeE7 / 1e7,
            lng: start.longitudeE7 / 1e7,
          });
        }
        if (end?.latitudeE7 && endTs) {
          locations.push({
            timestamp: new Date(endTs),
            lat: end.latitudeE7 / 1e7,
            lng: end.longitudeE7 / 1e7,
          });
        }
      }
    }
  } else if (json && Array.isArray(json.semanticSegments)) {
    console.log(`Found ${json.semanticSegments.length} semantic segments`);
    for (const segment of json.semanticSegments) {
      // Handle timelinePath (points during travel)
      if (Array.isArray(segment.timelinePath)) {
        for (const pathObj of segment.timelinePath) {
          const coords = parseLatLngString(pathObj.point);
          if (coords && pathObj.time) {
            locations.push({
              timestamp: new Date(pathObj.time),
              lat: coords.lat,
              lng: coords.lng
            });
          }
        }
      }
      // Handle visits (staying at a place)
      const latLngStr = segment.visit?.topCandidate?.placeLocation?.latLng;
      if (latLngStr) {
        const coords = parseLatLngString(latLngStr);
        const tsValue = segment.startTime || segment.endTime;
        if (coords && tsValue) {
          locations.push({
            timestamp: new Date(tsValue),
            lat: coords.lat,
            lng: coords.lng
          });
        }
      }
    }
  } else {
    console.warn(`Unknown JSON structure. Available keys: ${json ? Object.keys(json).join(', ') : 'none'}`);
  }

  // Sort by timestamp
  locations = locations.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Calculate speeds
  for (let i = 0; i < locations.length - 1; i++) {
    const p1 = locations[i];
    const p2 = locations[i + 1];
    const dist = getDistanceKm(p1.lat, p1.lng, p2.lat, p2.lng);
    const timeHours = (p2.timestamp.getTime() - p1.timestamp.getTime()) / (1000 * 60 * 60);
    
    if (timeHours > 0) {
      const speed = dist / timeHours;
      // Cap unreasonable speeds (sensor jumps)
      p1.speedKmH = speed > 1200 ? 0 : speed;
    } else {
      p1.speedKmH = 0;
    }
  }

  return locations;
}

/**
 * Calculates total distance for a sequence of points
 */
export function calculateTotalDistance(points: LocationPoint[]): number {
  let totalKm = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    totalKm += getDistanceKm(p1.lat, p1.lng, p2.lat, p2.lng);
  }
  return totalKm;
}

/**
 * Calculates average speed for a sequence of points (Moving Average)
 */
export function calculateAverageSpeed(points: LocationPoint[]): number {
  if (points.length < 2) return 0;
  
  let movingDist = 0;
  let movingTimeMs = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    
    const dist = getDistanceKm(p1.lat, p1.lng, p2.lat, p2.lng);
    const timeMs = p2.timestamp.getTime() - p1.timestamp.getTime();
    
    if (timeMs > 0) {
      const speedKmH = dist / (timeMs / (1000 * 60 * 60));
      
      // Heuristic: Only consider segments where speed is > 1 km/h 
      // to exclude stationary periods, and < 1200 km/h to exclude GPS glitches.
      // Also ensure distance is at least 5 meters to avoid jitter.
      if (speedKmH > 1 && speedKmH < 1200 && dist > 0.005) {
        movingDist += dist;
        movingTimeMs += timeMs;
      }
    }
  }

  const movingTimeHours = movingTimeMs / (1000 * 60 * 60);

  if (movingTimeHours <= 0) return 0;
  return movingDist / movingTimeHours;
}

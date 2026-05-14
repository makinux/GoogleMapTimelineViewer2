/**
 * Utility functions for geographic calculations and parsing
 */

export interface LocationPoint {
  timestamp: Date;
  lat: number;
  lng: number;
  accuracy?: number;
  speedKmH?: number; // Estimated speed to next point
  extra?: Record<string, any>;
}

export interface PhotoItem {
  id: string;
  url: string; // Blob URL
  thumbnailUrl?: string; // Small thumbnail blob URL
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
  // Optional: original file for base64 conversion
  file?: File;
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
            extra: {
              verticalAccuracy: loc.verticalAccuracy,
              velocity: loc.velocity,
              heading: loc.heading,
              altitude: loc.altitude,
              source: loc.locationSource
            }
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
            extra: {
              placeId: loc.placeId,
              address: loc.address,
              name: loc.name,
              semanticType: loc.semanticType,
              locationSource: loc.locationSource
            }
          });
        }
      } else if (obj.activitySegment) {
        const start = obj.activitySegment.startLocation;
        const end = obj.activitySegment.endLocation;
        const startTs = obj.activitySegment.duration?.startTimestamp;
        const endTs = obj.activitySegment.duration?.endTimestamp;
        const activityExtra = {
          activityType: obj.activitySegment.activityType,
          confidence: obj.activitySegment.confidence,
          distanceMeters: obj.activitySegment.distance
        };

        if (start?.latitudeE7 && startTs) {
          locations.push({
            timestamp: new Date(startTs),
            lat: start.latitudeE7 / 1e7,
            lng: start.longitudeE7 / 1e7,
            extra: { ...activityExtra, pointType: 'START' }
          });
        }
        if (end?.latitudeE7 && endTs) {
          locations.push({
            timestamp: new Date(endTs),
            lat: end.latitudeE7 / 1e7,
            lng: end.longitudeE7 / 1e7,
            extra: { ...activityExtra, pointType: 'END' }
          });
        }
        
        // Handle waypoints if present
        if (Array.isArray(obj.activitySegment.waypointPath?.waypoints)) {
          for (const wp of obj.activitySegment.waypointPath.waypoints) {
            if (wp.latE7 && wp.lngE7) {
              locations.push({
                timestamp: new Date(startTs), // Waypoints usually don't have individual timestamps in this format
                lat: wp.latE7 / 1e7,
                lng: wp.lngE7 / 1e7,
                extra: { ...activityExtra, pointType: 'WAYPOINT' }
              });
            }
          }
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
      const placeId = segment.visit?.topCandidate?.placeId;
      if (latLngStr) {
        const coords = parseLatLngString(latLngStr);
        const tsValue = segment.startTime || segment.endTime;
        if (coords && tsValue) {
          locations.push({
            timestamp: new Date(tsValue),
            lat: coords.lat,
            lng: coords.lng,
            extra: placeId ? { placeId } : undefined
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

import JSZip from 'jszip';

/**
 * Generates a KML string from a sequence of points and photos
 */
export async function generateKML(
  points: LocationPoint[], 
  photos: PhotoItem[] = [], 
  options: { externalImages?: boolean } = {}
): Promise<string> {
  const placemarks = points
    .filter(p => p.extra?.placeId)
    .map((p) => {
      const timeStr = p.timestamp.toISOString();
      const lat = p.lat;
      const lng = p.lng;
      const height = p.extra?.altitude || 0;
      const placeId = p.extra?.placeId;

      return `
    <Placemark>
      <name>placeId:${placeId}</name>
      <description>Timestamp: ${timeStr}
      Latitude: ${lat}
      Longitude: ${lng}</description>
      <Point>
        <coordinates> ${lng}, ${lat}, ${height}</coordinates>
      </Point>      
    </Placemark>`;
    }).join('');

  // Process photos
  const photoFeatures = await Promise.all(photos.map(async (photo, index) => {
    const lat = photo.location.latitude;
    const lng = photo.location.longitude;
    const timeStr = photo.creationTime || '';
    
    let description = `Filename: ${photo.filename}\nTime: ${timeStr}`;
    let imageHref = '';

    if (options.externalImages) {
      // Reference relative to KMZ root
      imageHref = `images/photo_${index}.jpg`;
      description = `<![CDATA[<img src="${imageHref}"/><br/>${description}]]>`;
    } else {
      try {
        // Use thumbnailUrl if available for smaller base64 string
        const fetchUrl = photo.thumbnailUrl || photo.url;
        const response = await fetch(fetchUrl);
        const blob = await response.blob();
        imageHref = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        description = `<![CDATA[<img src="${imageHref}"/><br/>${description}]]>`;
      } catch (err) {
        console.error('Failed to convert photo to base64 for KML:', err);
      }
    }

    return `
    <Placemark>
      <name>${photo.filename}</name>
      <description>${description}</description>
      ${timeStr ? `<TimeStamp><when>${timeStr}</when></TimeStamp>` : ''}
      <Point>
        <coordinates>${lng},${lat},0</coordinates>
      </Point>
    </Placemark>`;
  }));

  const trackCoordinates = points.map(p => `${p.lng},${p.lat},0`).join(' ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Geo Timeline Export</name>
    <description>Generated by Geo Timeline Voyager</description>
    <Style id="trackStyle">
      <LineStyle>
        <color>ff0000ff</color>
        <width>4</width>
      </LineStyle>
    </Style>
    <Placemark>
      <name>Track</name>
      <styleUrl>#trackStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>${trackCoordinates}</coordinates>
      </LineString>
    </Placemark>
    ${placemarks}
    ${photoFeatures.join('')}
  </Document>
</kml>`;
}

/**
 * Generates a KMZ blob from a sequence of points and photos
 */
export async function generateKMZ(points: LocationPoint[], photos: PhotoItem[] = []): Promise<Blob> {
  const kml = await generateKML(points, photos, { externalImages: true });
  const zip = new JSZip();
  zip.file("doc.kml", kml);
  
  // Add images to ZIP
  const imageFolder = zip.folder("images");
  if (imageFolder) {
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      // Fetch the thumbnail blob
      try {
        const fetchUrl = photo.thumbnailUrl || photo.url;
        const response = await fetch(fetchUrl);
        const blob = await response.blob();
        imageFolder.file(`photo_${i}.jpg`, blob);
      } catch (err) {
        console.error(`Failed to add photo_${i} to KMZ:`, err);
      }
    }
  }
  
  return await zip.generateAsync({ type: "blob" });
}

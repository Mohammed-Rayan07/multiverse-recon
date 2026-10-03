import { describe, expect, it } from 'vitest';
import {
  formatDistance,
  greatCircleSegments,
  haversineKm,
  initialBearing,
  normalizeLng,
  vincentyKm,
} from './geo';

// Reference coordinates
const PARIS = { lat: 48.8566, lng: 2.3522 };
const LONDON = { lat: 51.5074, lng: -0.1278 };
const NEW_YORK = { lat: 40.7128, lng: -74.006 };
const SYDNEY = { lat: -33.8688, lng: 151.2093 };
const NITK = { lat: 13.0108, lng: 74.7943 }; // NITK Surathkal
const BENGALURU = { lat: 12.9716, lng: 77.5946 };

describe('haversineKm', () => {
  it('is zero for identical points', () => {
    expect(haversineKm(PARIS, PARIS)).toBe(0);
  });

  it('matches known city-pair distances (within 0.5%)', () => {
    expect(haversineKm(PARIS, LONDON)).toBeCloseTo(343.6, -1);
    expect(haversineKm(LONDON, NEW_YORK)).toBeCloseTo(5570, -1);
    expect(haversineKm(NEW_YORK, SYDNEY) / 15990).toBeCloseTo(1, 2);
    expect(haversineKm(NITK, BENGALURU)).toBeCloseTo(304, -1);
  });

  it('is symmetric', () => {
    expect(haversineKm(SYDNEY, LONDON)).toBeCloseTo(haversineKm(LONDON, SYDNEY), 9);
  });

  it('one degree of latitude ≈ 111.2 km', () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.195, 2);
  });

  it('takes the short way across the antimeridian', () => {
    // 179.5°E to 179.5°W is 1° of longitude at the equator, not 359°.
    const d = haversineKm({ lat: 0, lng: 179.5 }, { lat: 0, lng: -179.5 });
    expect(d).toBeCloseTo(111.195, 2);
  });

  it('handles antipodal points (half the circumference)', () => {
    const d = haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
    expect(d).toBeCloseTo(Math.PI * 6371.0088, 3);
    expect(haversineKm({ lat: 90, lng: 0 }, { lat: -90, lng: 0 })).toBeCloseTo(Math.PI * 6371.0088, 3);
  });

  it('treats wrapped Leaflet longitudes (e.g. 362°) like their canonical value', () => {
    expect(haversineKm(PARIS, { lat: LONDON.lat, lng: LONDON.lng + 360 })).toBeCloseTo(haversineKm(PARIS, LONDON), 6);
  });

  it('is accurate for very short distances (metres)', () => {
    // 0.0001° of latitude ≈ 11.1 m
    expect(haversineKm(PARIS, { lat: PARIS.lat + 0.0001, lng: PARIS.lng }) * 1000).toBeCloseTo(11.12, 1);
  });
});

describe('vincentyKm (WGS-84 ellipsoid)', () => {
  it('matches the classic Flinders Peak → Buninyong test (54,972.271 m)', () => {
    const flinders = { lat: -(37 + 57 / 60 + 3.7203 / 3600), lng: 144 + 25 / 60 + 29.5244 / 3600 };
    const buninyong = { lat: -(37 + 39 / 60 + 10.1561 / 3600), lng: 143 + 55 / 60 + 35.3839 / 3600 };
    expect(vincentyKm(flinders, buninyong)!).toBeCloseTo(54.972271, 5);
  });

  it('stays within 0.5% of Haversine', () => {
    const v = vincentyKm(LONDON, NEW_YORK)!;
    expect(Math.abs(v - haversineKm(LONDON, NEW_YORK)) / v).toBeLessThan(0.005);
  });

  it('returns 0 for identical points', () => {
    expect(vincentyKm(SYDNEY, SYDNEY)).toBe(0);
  });
});

describe('normalizeLng', () => {
  it('wraps into [-180, 180)', () => {
    expect(normalizeLng(200)).toBe(-160);
    expect(normalizeLng(-200)).toBe(160);
    expect(normalizeLng(540)).toBe(-180);
    expect(normalizeLng(45)).toBe(45);
    expect(normalizeLng(-360)).toBe(0);
  });
});

describe('initialBearing', () => {
  it('points due north / east correctly', () => {
    expect(initialBearing({ lat: 0, lng: 0 }, { lat: 10, lng: 0 })).toBeCloseTo(0, 6);
    expect(initialBearing({ lat: 0, lng: 0 }, { lat: 0, lng: 10 })).toBeCloseTo(90, 6);
  });
});

describe('greatCircleSegments', () => {
  it('splits paths that cross the antimeridian', () => {
    const segs = greatCircleSegments({ lat: -17.7, lng: 178 }, { lat: 21.3, lng: -157.8 }); // Fiji → Hawaii
    expect(segs.length).toBe(2);
    for (const seg of segs) {
      for (let i = 1; i < seg.length; i++) {
        expect(Math.abs(seg[i][1] - seg[i - 1][1])).toBeLessThan(180);
      }
    }
  });

  it('keeps a single segment otherwise', () => {
    expect(greatCircleSegments(PARIS, NEW_YORK).length).toBe(1);
  });
});

describe('formatDistance', () => {
  it('chooses sensible units', () => {
    expect(formatDistance(0.012)).toBe('12 m');
    expect(formatDistance(4.371)).toBe('4.37 km');
    expect(formatDistance(1204.4)).toBe('1,204 km');
    expect(formatDistance(1.609344, 'mi')).toBe('1.00 mi');
  });
});

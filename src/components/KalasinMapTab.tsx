'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  NavigationControl,
  type ErrorEvent as MapLibreErrorEvent,
  type StyleSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  AlertTriangle,
  ArrowUpRight,
  Compass,
  Layers,
  MapPin,
  Navigation,
  Phone,
  Users,
} from 'lucide-react';
import type { GroupWithContext, WorkspacePayload } from '@/lib/types';
import type { FieldMissionPoint } from '@/lib/kalasin-field-points';
import { apiRequest } from '@/lib/api-client';
import { StatusBadge } from './StatusBadge';

const KALASIN_PROVINCE_CENTER: [number, number] = [103.62, 16.56];

const OSM_RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'osm-tiles',
      type: 'raster',
      source: 'osm',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

type SelectedItem =
  | { kind: 'group'; group: GroupWithContext }
  | { kind: 'field'; point: FieldMissionPoint };

function shortLabel(nameTh: string) {
  return nameTh.replace(/^กลุ่มพันธกิจบ้าน/, 'บ้าน');
}

function pinStatusClass(g: GroupWithContext) {
  if (g.currentReport.isBlocked) return 'bg-[var(--fm-coral)] text-[var(--fm-paper)]';
  if (g.currentReport.status === 'approved') return 'bg-[var(--fm-lime)] text-[var(--fm-ink)]';
  if (g.currentReport.status === 'needs_revision')
    return 'bg-[var(--fm-amber)] text-[var(--fm-ink)]';
  if (g.currentReport.status === 'submitted' || g.currentReport.status === 'under_review')
    return 'bg-[var(--fm-violet)] text-[var(--fm-paper)]';
  return 'bg-[var(--fm-ink)] text-[var(--fm-paper)]';
}

function pinDotColor(g: GroupWithContext): string {
  if (g.currentReport.isBlocked) return 'var(--fm-coral)';
  if (g.currentReport.status === 'approved') return 'var(--fm-lime)';
  if (g.currentReport.status === 'needs_revision') return 'var(--fm-amber)';
  if (g.currentReport.status === 'submitted' || g.currentReport.status === 'under_review')
    return 'var(--fm-violet)';
  return 'var(--fm-ink)';
}

export function KalasinMapTab({
  workspace,
  onSelectGroupReport,
  canOpenReport = true,
}: {
  workspace: WorkspacePayload;
  onSelectGroupReport: (groupId: string) => void;
  canOpenReport?: boolean;
}) {
  // DEC-06, DEC-17: field points come from the server, which decides who may read them (admin, the Body Leader of
  // the point's Body, the assigned coordinator). The list is never part of the browser bundle.
  const [fieldPoints, setFieldPoints] = useState<FieldMissionPoint[]>([]);
  const [selected, setSelected] = useState<SelectedItem | null>(
    workspace.groups[0] ? { kind: 'group', group: workspace.groups[0] } : null
  );
  useEffect(() => {
    let cancelled = false;
    apiRequest<{
      points: Array<{ pointNo: number; pointName: string; teamCode: string; coordinatorName: string | null; phone: string | null; latitude: number; longitude: number; mapsUrl: string | null }>;
    }>('/api/v1/team-field-points')
      .then((res) => {
        if (cancelled) return;
        setFieldPoints(
          res.points.map((p) => ({
            no: p.pointNo,
            name: p.pointName,
            team: p.teamCode,
            coordinator: p.coordinatorName ?? '-',
            phone: p.phone ?? '',
            latitude: p.latitude,
            longitude: p.longitude,
            mapsUrl: p.mapsUrl ?? '',
          }))
        );
      })
      .catch(() => {
        // 403 is the normal answer for most people. They see the groups only.
        if (!cancelled) setFieldPoints([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const [mapMode, setMapMode] = useState<'maplibre' | 'schematic'>('maplibre');
  const [layerFilter, setLayerFilter] = useState<'ALL' | 'GROUPS' | 'TEAM_G'>('ALL');
  const [mapError, setMapError] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);

  const locatedGroups = useMemo(
    () =>
      workspace.groups.filter(
        (g): g is GroupWithContext & { latitude: number; longitude: number } =>
          g.locationStatus !== 'pending_location' &&
          typeof g.latitude === 'number' &&
          typeof g.longitude === 'number'
      ),
    [workspace.groups]
  );

  const unlocatedGroups = useMemo(
    () =>
      workspace.groups.filter(
        (g) =>
          g.locationStatus === 'pending_location' ||
          g.latitude === null ||
          g.longitude === null
      ),
    [workspace.groups]
  );

  const visibleGroups = useMemo(
    () => (layerFilter === 'TEAM_G' ? [] : locatedGroups),
    [locatedGroups, layerFilter]
  );

  const visibleFieldPoints = useMemo(
    () => (layerFilter === 'GROUPS' ? [] : fieldPoints),
    [layerFilter, fieldPoints]
  );

  const totalVisible = visibleGroups.length + visibleFieldPoints.length;

  // Offset duplicate coordinates slightly so stacked pins (e.g. บ้านภูฮัง / บ้านภูฮัง2) stay individually clickable
  const fieldPointsWithDisplayCoords = useMemo(() => {
    const seen: Record<string, number> = {};
    return visibleFieldPoints.map((pt) => {
      const key = `${pt.latitude.toFixed(5)},${pt.longitude.toFixed(5)}`;
      const dupIndex = seen[key] ?? 0;
      seen[key] = dupIndex + 1;
      const offset = dupIndex * 0.0014;
      return {
        point: pt,
        displayLat: pt.latitude + offset,
        displayLng: pt.longitude + offset,
      };
    });
  }, [visibleFieldPoints]);

  // Initialize MapLibre GL map once when in 'maplibre' mode
  useEffect(() => {
    if (mapMode !== 'maplibre' || !mapContainerRef.current) return;

    setMapError(null);
    let map: MapLibreMap | null = null;

    try {
      map = new MapLibreMap({
        container: mapContainerRef.current,
        style: OSM_RASTER_STYLE,
        center: KALASIN_PROVINCE_CENTER,
        zoom: 9.8,
      });

      map.addControl(
        new NavigationControl({ showCompass: true, showZoom: true }),
        'top-right'
      );

      map.on('error', (event: MapLibreErrorEvent) => {
        if (event?.error && !mapInstanceRef.current) {
          setMapError('ไม่สามารถโหลดแผนที่ MapLibre ได้ในอุปกรณ์นี้');
        }
      });

      mapInstanceRef.current = map;
    } catch {
      setMapError('อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับ WebGL สำหรับแผนที่ MapLibre');
    }

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      if (map) {
        map.remove();
      }
      mapInstanceRef.current = null;
    };
  }, [mapMode]);

  // Sync MapLibre markers whenever visible items or selection change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (mapMode !== 'maplibre' || !map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // 1. Render 5 Pilot Reporting Groups
    visibleGroups.forEach((g) => {
      const isSelected = selected?.kind === 'group' && selected.group.id === g.id;

      const el = document.createElement('button');
      el.type = 'button';
      el.setAttribute('aria-label', `${g.nameTh} อำเภอ${g.district}`);
      el.style.display = 'inline-flex';
      el.style.alignItems = 'center';
      el.style.gap = '6px';
      el.style.padding = '5px 10px';
      el.style.borderRadius = '14px';
      el.style.border = '2px solid var(--fm-ink)';
      el.style.background = isSelected ? 'var(--fm-lime)' : 'var(--fm-paper)';
      el.style.color = 'var(--fm-ink)';
      el.style.fontWeight = '800';
      el.style.fontSize = '16px';
      el.style.minHeight = '48px';
      el.style.cursor = 'pointer';
      el.style.whiteSpace = 'nowrap';
      el.style.boxShadow = isSelected
        ? '4px 4px 0px var(--fm-ink)'
        : '2px 2px 0px var(--fm-ink)';
      el.style.transform = isSelected ? 'scale(1.08)' : 'scale(1)';

      const dot = document.createElement('span');
      dot.style.width = '14px';
      dot.style.height = '14px';
      dot.style.borderRadius = '9999px';
      dot.style.border = '2px solid var(--fm-ink)';
      dot.style.background = pinDotColor(g);
      dot.style.flexShrink = '0';

      const text = document.createElement('span');
      text.textContent = shortLabel(g.nameTh);

      el.appendChild(dot);
      el.appendChild(text);

      el.addEventListener('click', () => {
        setSelected({ kind: 'group', group: g });
      });

      const marker = new MapLibreMarker({ element: el, anchor: 'center' })
        .setLngLat([g.longitude, g.latitude])
        .addTo(map);
      marker.getElement().style.zIndex = isSelected ? '40' : '20';
      markersRef.current.push(marker);
    });

    // 2. Render 23 Team G Field Mission Points from Google Sheet
    fieldPointsWithDisplayCoords.forEach(({ point: pt, displayLat, displayLng }) => {
      const isSelected = selected?.kind === 'field' && selected.point.no === pt.no;

      const el = document.createElement('button');
      el.type = 'button';
      el.setAttribute('aria-label', `จุดพันธกิจทีม G: ${pt.name}`);
      el.style.display = 'inline-flex';
      el.style.alignItems = 'center';
      el.style.gap = '5px';
      el.style.padding = '4px 8px';
      el.style.borderRadius = '9999px';
      el.style.border = '2px solid var(--fm-ink)';
      el.style.background = isSelected ? 'var(--fm-lime)' : 'var(--fm-paper)';
      el.style.color = 'var(--fm-ink)';
      el.style.fontWeight = '800';
      el.style.fontSize = '16px';
      el.style.minHeight = '48px';
      el.style.cursor = 'pointer';
      el.style.whiteSpace = 'nowrap';
      el.style.boxShadow = isSelected
        ? '4px 4px 0px var(--fm-ink)'
        : '2px 2px 0px var(--fm-ink)';
      el.style.transform = isSelected ? 'scale(1.1)' : 'scale(1)';

      const badge = document.createElement('span');
      badge.textContent = `G${pt.no}`;
      badge.style.display = 'inline-flex';
      badge.style.alignItems = 'center';
      badge.style.justifyContent = 'center';
      badge.style.padding = '1px 5px';
      badge.style.borderRadius = '9999px';
      badge.style.background = 'var(--fm-violet)';
      badge.style.color = 'var(--fm-paper)';
      badge.style.fontSize = '16px';
      badge.style.fontWeight = '800';

      const text = document.createElement('span');
      text.textContent = pt.name;

      el.appendChild(badge);
      el.appendChild(text);

      el.addEventListener('click', () => {
        setSelected({ kind: 'field', point: pt });
      });

      const marker = new MapLibreMarker({ element: el, anchor: 'center' })
        .setLngLat([displayLng, displayLat])
        .addTo(map);
      marker.getElement().style.zIndex = isSelected ? '45' : '15';
      markersRef.current.push(marker);
    });
  }, [visibleGroups, fieldPointsWithDisplayCoords, selected, mapMode]);

  // Smoothly pan camera when user picks an item
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (mapMode !== 'maplibre' || !map || !selected) return;

    const targetLat =
      selected.kind === 'group' ? selected.group.latitude : selected.point.latitude;
    const targetLng =
      selected.kind === 'group' ? selected.group.longitude : selected.point.longitude;
    if (typeof targetLat !== 'number' || typeof targetLng !== 'number') return;

    map.flyTo({
      center: [targetLng, targetLat],
      zoom: Math.max(map.getZoom(), 11.8),
      duration: 500,
      essential: true,
    });
  }, [selected, mapMode]);

  // Expanded Kalasin Province Bounding Box for Offline Schematic Fallback:
  // Lat 16.29..16.96, Lng 103.22..104.16
  const minLat = 16.29;
  const maxLat = 16.96;
  const minLng = 103.22;
  const maxLng = 104.16;

  function project(lat: number, lng: number) {
    const xPct = Math.min(92, Math.max(8, ((lng - minLng) / (maxLng - minLng)) * 100));
    const yPct = Math.min(90, Math.max(10, ((maxLat - lat) / (maxLat - minLat)) * 100));
    return { xPct, yPct };
  }

  return (
    <div className="space-y-6">
      <section className="fm-panel-ink flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-[var(--fm-paper)] sm:text-3xl">
            แผนที่พิกัดกลุ่มพันธกิจบ้าน จังหวัดกาฬสินธุ์
          </h1>
          <p className="mt-1 text-base font-medium text-[var(--fm-canvas)]">
            รวมกลุ่มนำร่องส่งรายงาน ({workspace.groups.length}) และพิกัดจุดพันธกิจจริง ทีม G (
            {fieldPoints.length}) บนแผนที่ถนนจริง MapLibre + OpenStreetMap
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex rounded-xl border-2 border-[var(--fm-paper)] bg-[var(--fm-ink)] p-1">
            <button
              type="button"
              onClick={() => setMapMode('maplibre')}
              className={`min-h-[48px] rounded-lg px-3.5 py-1.5 text-base font-extrabold transition-transform ${
                mapMode === 'maplibre'
                  ? 'bg-[var(--fm-lime)] text-[var(--fm-ink)]'
                  : 'text-[var(--fm-paper)]'
              }`}
            >
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <Compass className="h-4 w-4" aria-hidden="true" />
                <span>แผนที่จริง (MapLibre)</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMapMode('schematic')}
              className={`min-h-[48px] rounded-lg px-3.5 py-1.5 text-base font-extrabold transition-transform ${
                mapMode === 'schematic'
                  ? 'bg-[var(--fm-lime)] text-[var(--fm-ink)]'
                  : 'text-[var(--fm-paper)]'
              }`}
            >
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <Layers className="h-4 w-4" aria-hidden="true" />
                <span>แผนผังแบบง่าย</span>
              </span>
            </button>
          </div>

          <span className="fm-sticker bg-[var(--fm-lime)] text-[var(--fm-ink)]">
            <MapPin className="h-4 w-4" aria-hidden="true" />
            <span>{totalVisible} จุดบนแผนที่</span>
          </span>
        </div>
      </section>

      {/* Layer Filter + Quick Jump Chips */}
      <section className="fm-card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-extrabold text-[var(--fm-ink)]">แสดงชั้นข้อมูล:</span>
          <button
            type="button"
            onClick={() => setLayerFilter('ALL')}
            className={`min-h-[48px] rounded-xl border-2 border-[var(--fm-ink)] px-3.5 py-1.5 text-base font-extrabold ${
              layerFilter === 'ALL'
                ? 'bg-[var(--fm-ink)] text-[var(--fm-lime)]'
                : 'bg-[var(--fm-paper)] text-[var(--fm-ink)]'
            }`}
          >
            ทั้งหมด ({workspace.groups.length + fieldPoints.length})
          </button>
          <button
            type="button"
            onClick={() => setLayerFilter('TEAM_G')}
            className={`min-h-[48px] rounded-xl border-2 border-[var(--fm-ink)] px-3.5 py-1.5 text-base font-extrabold ${
              layerFilter === 'TEAM_G'
                ? 'bg-[var(--fm-violet)] text-[var(--fm-paper)]'
                : 'bg-[var(--fm-paper)] text-[var(--fm-ink)]'
            }`}
          >
            จุดพันธกิจจริง ทีม G ({fieldPoints.length})
          </button>
          <button
            type="button"
            onClick={() => setLayerFilter('GROUPS')}
            className={`min-h-[48px] rounded-xl border-2 border-[var(--fm-ink)] px-3.5 py-1.5 text-base font-extrabold ${
              layerFilter === 'GROUPS'
                ? 'bg-[var(--fm-lime)] text-[var(--fm-ink)]'
                : 'bg-[var(--fm-paper)] text-[var(--fm-ink)]'
            }`}
          >
            กลุ่มส่งรายงานประจำสัปดาห์ ({workspace.groups.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-t-2 border-[var(--fm-ink)]/15 pt-3">
          {visibleGroups.map((g) => {
            const isSelected = selected?.kind === 'group' && selected.group.id === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setSelected({ kind: 'group', group: g })}
                className={`min-h-[48px] rounded-xl border-2 border-[var(--fm-ink)] px-2.5 py-1 text-base font-extrabold ${
                  isSelected
                    ? 'bg-[var(--fm-lime)] text-[var(--fm-ink)] shadow-[2px_2px_0px_var(--fm-ink)]'
                    : 'bg-[var(--fm-canvas)] text-[var(--fm-ink)]'
                }`}
              >
                {shortLabel(g.nameTh)}
              </button>
            );
          })}
          {visibleFieldPoints.map((pt) => {
            const isSelected = selected?.kind === 'field' && selected.point.no === pt.no;
            return (
              <button
                key={`g-chip-${pt.no}`}
                type="button"
                onClick={() => setSelected({ kind: 'field', point: pt })}
                className={`min-h-[48px] rounded-xl border-2 border-[var(--fm-ink)] px-2.5 py-1 text-base font-extrabold ${
                  isSelected
                    ? 'bg-[var(--fm-lime)] text-[var(--fm-ink)] shadow-[2px_2px_0px_var(--fm-ink)]'
                    : 'bg-[var(--fm-paper)] text-[var(--fm-ink)]'
                }`}
              >
                <span className="mr-1 text-[var(--fm-violet)]">G{pt.no}</span>
                {pt.name}
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Main Map Viewport (8 cols) */}
        <section className="fm-panel relative h-[540px] overflow-hidden bg-[var(--fm-canvas)] lg:col-span-8">
          {mapMode === 'maplibre' ? (
            <>
              <div ref={mapContainerRef} className="h-full w-full" />
              {mapError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[var(--fm-canvas)] p-6 text-center">
                  <AlertTriangle className="h-10 w-10 text-[var(--fm-coral)]" aria-hidden="true" />
                  <p className="max-w-md text-base font-extrabold text-[var(--fm-ink)]">
                    {mapError}
                  </p>
                  <button
                    type="button"
                    onClick={() => setMapMode('schematic')}
                    className="fm-btn fm-btn-lime whitespace-nowrap text-base"
                  >
                    <Layers className="h-4 w-4" aria-hidden="true" />
                    <span>สลับไปใช้แผนผังแบบง่าย</span>
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="relative h-full w-full p-4">
              <svg
                viewBox="0 0 800 500"
                className="pointer-events-none absolute inset-0 h-full w-full"
                aria-hidden="true"
              >
                <rect width="800" height="500" fill="var(--fm-canvas)" />
                <line
                  x1="200"
                  y1="0"
                  x2="200"
                  y2="500"
                  stroke="var(--fm-ink)"
                  strokeOpacity="0.18"
                  strokeWidth="2"
                />
                <line
                  x1="400"
                  y1="0"
                  x2="400"
                  y2="500"
                  stroke="var(--fm-ink)"
                  strokeOpacity="0.18"
                  strokeWidth="2"
                />
                <line
                  x1="600"
                  y1="0"
                  x2="600"
                  y2="500"
                  stroke="var(--fm-ink)"
                  strokeOpacity="0.18"
                  strokeWidth="2"
                />
                <line
                  x1="0"
                  y1="165"
                  x2="800"
                  y2="165"
                  stroke="var(--fm-ink)"
                  strokeOpacity="0.18"
                  strokeWidth="2"
                />
                <line
                  x1="0"
                  y1="330"
                  x2="800"
                  y2="330"
                  stroke="var(--fm-ink)"
                  strokeOpacity="0.18"
                  strokeWidth="2"
                />
                <text x="28" y="34" fill="var(--fm-ink)" fontSize="15" fontWeight="800">
                  โซนเหนือ (ท่าคันโท · ห้วยเม็ก)
                </text>
                <text x="540" y="34" fill="var(--fm-ink)" fontSize="15" fontWeight="800">
                  โซนตะวันออก (เขาวง · กุฉินารายณ์)
                </text>
                <text x="28" y="480" fill="var(--fm-ink)" fontSize="15" fontWeight="800">
                  โซนใต้ (ยางตลาด · เมืองกาฬสินธุ์ · กมลาไสย)
                </text>
              </svg>

              {visibleGroups.map((g) => {
                const { xPct, yPct } = project(g.latitude, g.longitude);
                const isSelected = selected?.kind === 'group' && selected.group.id === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelected({ kind: 'group', group: g })}
                    style={{ left: `${xPct}%`, top: `${yPct}%` }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-[var(--fm-ink)] px-2.5 py-1 text-left ${
                      isSelected
                        ? 'z-30 scale-105 bg-[var(--fm-lime)] text-[var(--fm-ink)] shadow-[4px_4px_0px_var(--fm-ink)]'
                        : 'z-20 bg-[var(--fm-paper)] text-[var(--fm-ink)] shadow-[2px_2px_0px_var(--fm-ink)]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-md border border-[var(--fm-ink)] ${pinStatusClass(
                          g
                        )}`}
                      >
                        <MapPin className="h-3 w-3" aria-hidden="true" />
                      </span>
                      <span className="whitespace-nowrap text-base font-extrabold">
                        {shortLabel(g.nameTh)}
                      </span>
                    </div>
                  </button>
                );
              })}

              {fieldPointsWithDisplayCoords.map(({ point: pt, displayLat, displayLng }) => {
                const { xPct, yPct } = project(displayLat, displayLng);
                const isSelected = selected?.kind === 'field' && selected.point.no === pt.no;
                return (
                  <button
                    key={`sch-g-${pt.no}`}
                    type="button"
                    onClick={() => setSelected({ kind: 'field', point: pt })}
                    style={{ left: `${xPct}%`, top: `${yPct}%` }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--fm-ink)] px-2 py-0.5 text-left ${
                      isSelected
                        ? 'z-40 scale-110 bg-[var(--fm-lime)] text-[var(--fm-ink)] shadow-[4px_4px_0px_var(--fm-ink)]'
                        : 'z-10 bg-[var(--fm-paper)] text-[var(--fm-ink)] shadow-[2px_2px_0px_var(--fm-ink)]'
                    }`}
                  >
                    <span className="whitespace-nowrap text-base font-extrabold">
                      <span className="mr-1 text-[var(--fm-violet)]">G{pt.no}</span>
                      {pt.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Selected Point / Group Inspector (4 cols) */}
        <section className="fm-panel overflow-hidden lg:col-span-4">
          {selected?.kind === 'group' ? (
            <div className="flex h-full flex-col justify-between">
              <div>
                <div className="border-b-2 border-[var(--fm-ink)] bg-[var(--fm-ink)] p-5 text-[var(--fm-paper)]">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-display text-2xl font-extrabold text-[var(--fm-paper)]">
                      {selected.group.nameTh}
                    </h2>
                    <span className="rounded-md border border-[var(--fm-paper)] bg-[var(--fm-ink)] px-2 py-0.5 font-mono text-base font-bold text-[var(--fm-lime)]">
                      {selected.group.groupCode}
                    </span>
                  </div>
                  <p className="mt-1 text-base font-bold text-[var(--fm-canvas)]">
                    {selected.group.bodyName}
                  </p>
                </div>

                <div className="space-y-4 p-5">
                  <StatusBadge
                    status={selected.group.currentReport.status}
                    isBlocked={selected.group.currentReport.isBlocked}
                    isLate={selected.group.currentReport.isLate}
                  />

                  <dl className="divide-y-2 divide-[var(--fm-ink)] rounded-xl border-2 border-[var(--fm-ink)] bg-[var(--fm-canvas)] text-base">
                    <div className="p-3">
                      <dt className="text-base font-extrabold text-[var(--fm-ink)]">ที่ตั้งกลุ่มบ้าน</dt>
                      <dd className="mt-0.5 font-bold text-[var(--fm-ink)]">
                        {selected.group.addressSummary || 'ยังไม่ระบุสถานที่นัดหมาย'}
                      </dd>
                    </div>
                    <div className="p-3">
                      <dt className="text-base font-extrabold text-[var(--fm-ink)]">พิกัด GPS จริง</dt>
                      <dd className="tabular-nums mt-0.5 font-mono text-base font-extrabold text-[var(--fm-violet)]">
                        {typeof selected.group.latitude === 'number' &&
                        typeof selected.group.longitude === 'number'
                          ? `${selected.group.latitude.toFixed(6)}, ${selected.group.longitude.toFixed(6)}`
                          : 'รอปักหมุด (ไม่มีพิกัด)'}
                      </dd>
                    </div>
                    <div className="p-3">
                      <dt className="text-base font-extrabold text-[var(--fm-ink)]">
                        ทีมผู้รับผิดชอบกลุ่ม
                      </dt>
                      <dd className="mt-2 space-y-1.5 text-base">
                        {selected.group.assignments.map((a) => (
                          <div
                            key={a.id}
                            className="rounded-lg border border-[var(--fm-ink)] bg-[var(--fm-paper)] px-3 py-1.5 font-bold text-[var(--fm-ink)]"
                          >
                            <span className="text-[var(--fm-violet)]">{a.roleType}</span>:{' '}
                            {a.displayName}
                          </div>
                        ))}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div className="space-y-2.5 border-t-2 border-[var(--fm-ink)] bg-[var(--fm-canvas)] p-5">
                {canOpenReport && (
                  <button
                    type="button"
                    onClick={() => onSelectGroupReport(selected.group.id)}
                    className="fm-btn fm-btn-lime w-full whitespace-nowrap text-base"
                  >
                    <span>เปิดหน้ารายงานกลุ่มนี้</span>
                    <ArrowUpRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                )}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selected.group.latitude},${selected.group.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="fm-btn fm-btn-ink flex w-full items-center justify-center gap-2 whitespace-nowrap text-base"
                >
                  <Navigation className="h-4 w-4" aria-hidden="true" />
                  <span>เปิดนำทางไปกลุ่มบ้าน</span>
                </a>
              </div>
            </div>
          ) : selected?.kind === 'field' ? (
            <div className="flex h-full flex-col justify-between">
              <div>
                <div className="border-b-2 border-[var(--fm-ink)] bg-[var(--fm-violet)] p-5 text-[var(--fm-paper)]">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-display text-2xl font-extrabold text-[var(--fm-paper)]">
                      {selected.point.name}
                    </h2>
                    <span className="rounded-md border border-[var(--fm-paper)] bg-[var(--fm-ink)] px-2.5 py-0.5 font-mono text-base font-bold text-[var(--fm-lime)]">
                      ทีม {selected.point.team} · #{selected.point.no}
                    </span>
                  </div>
                  <p className="mt-1 text-base font-bold text-[var(--fm-paper)]">
                    ข้อมูลจุดพันธกิจจริงจาก Google Sheet
                  </p>
                </div>

                <div className="space-y-4 p-5">
                  <dl className="divide-y-2 divide-[var(--fm-ink)] rounded-xl border-2 border-[var(--fm-ink)] bg-[var(--fm-canvas)] text-base">
                    <div className="p-3">
                      <dt className="text-base font-extrabold text-[var(--fm-ink)]">ผู้ประสานงานจุดพันธกิจ</dt>
                      <dd className="mt-1 flex items-center gap-2 font-extrabold text-[var(--fm-ink)]">
                        <Users className="h-4 w-4 text-[var(--fm-violet)]" aria-hidden="true" />
                        <span>{selected.point.coordinator}</span>
                      </dd>
                    </div>
                    <div className="p-3">
                      <dt className="text-base font-extrabold text-[var(--fm-ink)]">เบอร์โทรติดต่อ</dt>
                      <dd className="mt-1 font-mono text-base font-extrabold text-[var(--fm-ink)]">
                        {selected.point.phone}
                      </dd>
                    </div>
                    <div className="p-3">
                      <dt className="text-base font-extrabold text-[var(--fm-ink)]">พิกัด GPS จริง</dt>
                      <dd className="tabular-nums mt-0.5 font-mono text-base font-extrabold text-[var(--fm-violet)]">
                        {selected.point.latitude.toFixed(6)}, {selected.point.longitude.toFixed(6)}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div className="space-y-2.5 border-t-2 border-[var(--fm-ink)] bg-[var(--fm-canvas)] p-5">
                {selected.point.phone && !selected.point.phone.includes('*') && (
                <a
                  href={`tel:${selected.point.phone.replace(/[^0-9+]/g, '')}`}
                  className="fm-btn fm-btn-lime flex w-full items-center justify-center gap-2 whitespace-nowrap text-base"
                >
                  <Phone className="h-5 w-5" aria-hidden="true" />
                  <span>โทรหา {selected.point.coordinator.split(' ')[0]}</span>
                </a>
                )}
                <a
                  href={selected.point.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="fm-btn fm-btn-ink flex w-full items-center justify-center gap-2 whitespace-nowrap text-base"
                >
                  <Navigation className="h-4 w-4" aria-hidden="true" />
                  <span>เปิดนำทางด้วย Google Maps</span>
                </a>
              </div>
            </div>
          ) : (
            <p className="p-6 text-base font-bold text-[var(--fm-ink)]">
              แตะที่หมุดกลุ่มบ้านบนแผนที่เพื่อดูรายละเอียด
            </p>
          )}
        </section>
      </div>

      {unlocatedGroups.length > 0 && (
        <section
          aria-label="รายการกลุ่มรอปักหมุด"
          className="fm-bento-card bg-[var(--fm-paper)] p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[var(--fm-ink)] pb-3">
            <div>
              <h2 className="font-display text-xl font-extrabold text-[var(--fm-ink)]">
                กลุ่มรอปักหมุด (ไม่มีพิกัด GPS)
              </h2>
              <p className="text-base font-medium text-[var(--fm-ink-muted)]">
                แสดงเฉพาะรายชื่อและคำอธิบายสถานที่จริง โดยไม่ปักหมุดสมมติบนแผนที่
              </p>
            </div>
            <span className="rounded-full border-2 border-[var(--fm-ink)] bg-[var(--fm-amber-soft)] px-3 py-1 text-base font-extrabold text-[var(--fm-ink)]">
              {unlocatedGroups.length} กลุ่ม
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {unlocatedGroups.map((g) => (
              <div
                key={g.id}
                className="flex flex-col justify-between rounded-xl border-2 border-[var(--fm-ink)] bg-[var(--fm-canvas)] p-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-base font-extrabold text-[var(--fm-violet)]">
                      {g.groupCode}
                    </span>
                    <span className="rounded-md border border-[var(--fm-ink)] bg-[var(--fm-paper)] px-2 py-0.5 text-base font-bold text-[var(--fm-ink)]">
                      อ.{g.district}
                    </span>
                  </div>
                  <h3 className="mt-1.5 font-display text-lg font-extrabold text-[var(--fm-ink)]">
                    {g.nameTh}
                  </h3>
                  <p className="mt-1 text-base text-[var(--fm-ink-secondary)]">
                    {g.addressSummary || 'ยังไม่ระบุสถานที่นัดหมาย'}
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--fm-ink)]/20 pt-2.5 text-base font-bold text-[var(--fm-ink-muted)]">
                  <span>{g.bodyName || 'รอจัดสรรบอดี้'}</span>
                  {canOpenReport && (
                    <button
                      type="button"
                      onClick={() => onSelectGroupReport(g.id)}
                      className="min-h-[48px] rounded-lg border-2 border-[var(--fm-ink)] bg-[var(--fm-paper)] px-3 py-1.5 font-extrabold text-[var(--fm-ink)] hover:bg-[var(--fm-lime)]"
                    >
                      ส่งรายงาน
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

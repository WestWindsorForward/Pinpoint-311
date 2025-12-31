import { useEffect, useRef, useState, useCallback } from 'react';
import { MapPin, Layers, Filter, Search, X, ChevronDown, ChevronRight } from 'lucide-react';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { ServiceRequest, ServiceDefinition, User, Department } from '../types';
import { MapLayer } from '../services/api';

declare global {
    interface Window {
        google: typeof google;
    }
}

interface StaffDashboardMapProps {
    apiKey: string;
    requests: ServiceRequest[];
    services: ServiceDefinition[];
    departments: Department[];
    users: User[];
    mapLayers: MapLayer[];
    townshipBoundary?: object | null;
    defaultCenter?: { lat: number; lng: number };
    defaultZoom?: number;
    onRequestSelect: (requestId: string) => void;
}

// Status colors
const STATUS_COLORS = {
    open: '#ef4444',        // red
    in_progress: '#f59e0b', // amber
    closed: '#22c55e',      // green
};

export default function StaffDashboardMap({
    apiKey,
    requests,
    services,
    departments: _departments,
    users: _users,
    mapLayers,
    townshipBoundary,
    defaultCenter = { lat: 40.3573, lng: -74.6672 },
    defaultZoom = 13,
    onRequestSelect,
}: StaffDashboardMapProps) {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<google.maps.Map | null>(null);
    const markersRef = useRef<google.maps.Marker[]>([]);
    const clustererRef = useRef<MarkerClusterer | null>(null);
    const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
    const layerPolygonsRef = useRef<google.maps.Polygon[]>([]);

    // Filter state
    const [statusFilters, setStatusFilters] = useState({
        open: true,
        in_progress: true,
        closed: true,
    });
    const [categoryFilters, setCategoryFilters] = useState<Record<string, boolean>>({});
    const [layerFilters, setLayerFilters] = useState<Record<number, boolean>>({});
    const [assignmentFilter, setAssignmentFilter] = useState<string>(''); // username or department name

    // UI state
    const [isLoading, setIsLoading] = useState(true);
    const [showFilters, setShowFilters] = useState(true);
    const [expandedSections, setExpandedSections] = useState({
        status: true,
        categories: false,
        layers: false,
        assignment: false,
    });

    // Initialize category filters when services change
    useEffect(() => {
        const newFilters: Record<string, boolean> = {};
        services.forEach(s => {
            newFilters[s.service_code] = categoryFilters[s.service_code] ?? true;
        });
        setCategoryFilters(newFilters);
    }, [services]);

    // Initialize layer filters when mapLayers change
    useEffect(() => {
        const newFilters: Record<number, boolean> = {};
        mapLayers.forEach(layer => {
            newFilters[layer.id] = layerFilters[layer.id] ?? true;
        });
        setLayerFilters(newFilters);
    }, [mapLayers]);

    // Load Google Maps script
    useEffect(() => {
        if (!apiKey) {
            setIsLoading(false);
            return;
        }

        if (window.google?.maps) {
            initMap();
            return;
        }

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
        script.async = true;
        script.onload = () => initMap();
        script.onerror = () => setIsLoading(false);
        document.head.appendChild(script);

        return () => {
            // Cleanup markers
            markersRef.current.forEach(m => m.setMap(null));
            markersRef.current = [];
            if (clustererRef.current) {
                clustererRef.current.clearMarkers();
            }
        };
    }, [apiKey]);

    const initMap = useCallback(() => {
        if (!mapRef.current || !window.google) return;

        const map = new window.google.maps.Map(mapRef.current, {
            center: defaultCenter,
            zoom: defaultZoom,
            styles: [
                { elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
                { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a2e' }] },
                { elementType: 'labels.text.fill', stylers: [{ color: '#8b8b8b' }] },
                { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2d2d44' }] },
                { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
                { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1a3320' }] },
            ],
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
        });

        mapInstanceRef.current = map;
        infoWindowRef.current = new window.google.maps.InfoWindow();

        // Render township boundary if exists
        if (townshipBoundary) {
            renderBoundary(map, townshipBoundary);
        }

        setIsLoading(false);
    }, [defaultCenter, defaultZoom, townshipBoundary]);

    // Render township boundary
    const renderBoundary = (map: google.maps.Map, boundary: any) => {
        try {
            const dataLayer = new window.google.maps.Data();
            dataLayer.addGeoJson(boundary);
            dataLayer.setStyle({
                fillColor: '#6366f1',
                fillOpacity: 0.05,
                strokeColor: '#6366f1',
                strokeWeight: 2,
                strokeOpacity: 0.5,
            });
            dataLayer.setMap(map);
        } catch (e) {
            console.error('Error rendering boundary:', e);
        }
    };

    // Update markers when filters or requests change
    useEffect(() => {
        if (!mapInstanceRef.current || !window.google) return;
        updateMarkers();
    }, [requests, statusFilters, categoryFilters, assignmentFilter]);

    // Update GeoJSON layers when layer filters change
    useEffect(() => {
        if (!mapInstanceRef.current || !window.google) return;
        updateLayers();
    }, [mapLayers, layerFilters]);

    const updateMarkers = () => {
        const map = mapInstanceRef.current;
        if (!map) return;

        // Clear existing markers
        markersRef.current.forEach(m => m.setMap(null));
        markersRef.current = [];
        if (clustererRef.current) {
            clustererRef.current.clearMarkers();
        }

        // Filter requests
        const filteredRequests = requests.filter(r => {
            // Status filter
            if (!statusFilters[r.status as keyof typeof statusFilters]) return false;

            // Category filter
            if (!categoryFilters[r.service_code]) return false;

            // Assignment filter (search in assigned_to field)
            if (assignmentFilter) {
                const searchLower = assignmentFilter.toLowerCase();
                const assignedTo = (r as any).assigned_to?.toLowerCase() || '';
                if (!assignedTo.includes(searchLower)) return false;
            }

            // Must have coordinates
            if (!r.lat || !r.long) return false;

            return true;
        });

        // Create markers
        const markers = filteredRequests.map(request => {
            const marker = new window.google.maps.Marker({
                position: { lat: request.lat!, lng: request.long! },
                icon: {
                    path: window.google.maps.SymbolPath.CIRCLE,
                    fillColor: STATUS_COLORS[request.status as keyof typeof STATUS_COLORS] || '#6366f1',
                    fillOpacity: 1,
                    strokeColor: '#ffffff',
                    strokeWeight: 2,
                    scale: 8,
                },
                title: request.service_name,
            });

            marker.addListener('click', () => {
                if (infoWindowRef.current) {
                    infoWindowRef.current.setContent(`
                        <div style="padding: 12px; max-width: 280px; font-family: system-ui, sans-serif;">
                            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                                <span style="font-size: 11px; color: #666; font-family: monospace;">${request.service_request_id}</span>
                                <span style="font-size: 11px; padding: 2px 8px; border-radius: 9999px; background: ${STATUS_COLORS[request.status as keyof typeof STATUS_COLORS]}20; color: ${STATUS_COLORS[request.status as keyof typeof STATUS_COLORS]}; font-weight: 500;">
                                    ${request.status.replace('_', ' ')}
                                </span>
                            </div>
                            <h3 style="margin: 0 0 6px 0; font-size: 14px; font-weight: 600; color: #1a1a2e;">${request.service_name}</h3>
                            <p style="margin: 0 0 8px 0; font-size: 12px; color: #666; line-height: 1.4;">${request.description.substring(0, 100)}${request.description.length > 100 ? '...' : ''}</p>
                            ${request.address ? `<p style="margin: 0 0 12px 0; font-size: 11px; color: #888;">📍 ${request.address}</p>` : ''}
                            <button 
                                onclick="window.staffDashboardSelectRequest('${request.service_request_id}')"
                                style="width: 100%; padding: 8px 12px; background: #6366f1; color: white; border: none; border-radius: 8px; font-size: 12px; font-weight: 500; cursor: pointer;"
                            >
                                View Details
                            </button>
                        </div>
                    `);
                    infoWindowRef.current.open(map, marker);
                }
            });

            return marker;
        });

        // Set up global callback for info window button
        (window as any).staffDashboardSelectRequest = (requestId: string) => {
            if (infoWindowRef.current) {
                infoWindowRef.current.close();
            }
            onRequestSelect(requestId);
        };

        markersRef.current = markers;

        // Create clusterer
        clustererRef.current = new MarkerClusterer({
            map,
            markers,
            renderer: {
                render: ({ count, position }) => {
                    return new window.google.maps.Marker({
                        position,
                        icon: {
                            path: window.google.maps.SymbolPath.CIRCLE,
                            fillColor: '#6366f1',
                            fillOpacity: 0.9,
                            strokeColor: '#ffffff',
                            strokeWeight: 2,
                            scale: 16 + Math.min(count, 50) / 5,
                        },
                        label: {
                            text: String(count),
                            color: '#ffffff',
                            fontSize: '11px',
                            fontWeight: '600',
                        },
                        zIndex: 1000 + count,
                    });
                },
            },
        });
    };

    const updateLayers = () => {
        const map = mapInstanceRef.current;
        if (!map) return;

        // Clear existing layer polygons
        layerPolygonsRef.current.forEach(p => p.setMap(null));
        layerPolygonsRef.current = [];

        // Render active layers
        mapLayers.forEach(layer => {
            if (!layerFilters[layer.id]) return;
            if (!layer.visible_on_map) return;

            try {
                const geojson = layer.geojson as any;
                if (!geojson) return;

                const features = geojson.type === 'FeatureCollection'
                    ? geojson.features
                    : geojson.type === 'Feature'
                        ? [geojson]
                        : [];

                features.forEach((feature: any) => {
                    if (!feature.geometry) return;

                    const coords = feature.geometry.coordinates;
                    const type = feature.geometry.type;

                    if (type === 'Polygon') {
                        const paths = coords[0].map((c: number[]) => ({ lat: c[1], lng: c[0] }));
                        const polygon = new window.google.maps.Polygon({
                            paths,
                            fillColor: layer.fill_color,
                            fillOpacity: layer.fill_opacity,
                            strokeColor: layer.stroke_color,
                            strokeWeight: layer.stroke_width,
                            map,
                        });
                        layerPolygonsRef.current.push(polygon);
                    } else if (type === 'MultiPolygon') {
                        coords.forEach((polygonCoords: number[][][]) => {
                            const paths = polygonCoords[0].map((c: number[]) => ({ lat: c[1], lng: c[0] }));
                            const polygon = new window.google.maps.Polygon({
                                paths,
                                fillColor: layer.fill_color,
                                fillOpacity: layer.fill_opacity,
                                strokeColor: layer.stroke_color,
                                strokeWeight: layer.stroke_width,
                                map,
                            });
                            layerPolygonsRef.current.push(polygon);
                        });
                    }
                });
            } catch (e) {
                console.error('Error rendering layer:', layer.name, e);
            }
        });
    };

    const toggleSection = (section: keyof typeof expandedSections) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const toggleAllCategories = (value: boolean) => {
        const newFilters: Record<string, boolean> = {};
        Object.keys(categoryFilters).forEach(key => {
            newFilters[key] = value;
        });
        setCategoryFilters(newFilters);
    };

    const toggleAllLayers = (value: boolean) => {
        const newFilters: Record<number, boolean> = {};
        Object.keys(layerFilters).forEach(key => {
            newFilters[Number(key)] = value;
        });
        setLayerFilters(newFilters);
    };

    if (!apiKey) {
        return (
            <div className="h-full flex items-center justify-center bg-white/5 rounded-xl border border-white/10">
                <div className="text-center p-8">
                    <MapPin className="w-12 h-12 mx-auto mb-4 text-white/30" />
                    <p className="text-white/60">Google Maps API key not configured</p>
                    <p className="text-white/40 text-sm mt-2">Configure in Admin Console → API Keys</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex relative">
            {/* Map Container */}
            <div className="flex-1 relative">
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/5 z-10">
                        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                )}
                <div ref={mapRef} className="w-full h-full rounded-xl overflow-hidden" />
            </div>

            {/* Filter Panel Toggle */}
            <button
                onClick={() => setShowFilters(!showFilters)}
                className="absolute top-4 right-4 z-20 p-2 bg-white/10 backdrop-blur-md rounded-lg border border-white/20 hover:bg-white/20 transition-colors"
                title={showFilters ? 'Hide Filters' : 'Show Filters'}
            >
                {showFilters ? <X className="w-5 h-5 text-white" /> : <Filter className="w-5 h-5 text-white" />}
            </button>

            {/* Filter Panel */}
            {showFilters && (
                <div className="absolute top-4 right-14 z-20 w-64 max-h-[calc(100%-2rem)] overflow-y-auto bg-[#1a1a2e]/95 backdrop-blur-md rounded-xl border border-white/10 shadow-xl">
                    <div className="p-4 border-b border-white/10">
                        <h3 className="font-semibold text-white flex items-center gap-2">
                            <Layers className="w-4 h-4" />
                            Map Layers
                        </h3>
                    </div>

                    {/* Status Filters */}
                    <div className="border-b border-white/10">
                        <button
                            onClick={() => toggleSection('status')}
                            className="w-full flex items-center justify-between p-3 hover:bg-white/5"
                        >
                            <span className="text-sm font-medium text-white/80">Request Status</span>
                            {expandedSections.status ? (
                                <ChevronDown className="w-4 h-4 text-white/40" />
                            ) : (
                                <ChevronRight className="w-4 h-4 text-white/40" />
                            )}
                        </button>
                        {expandedSections.status && (
                            <div className="px-3 pb-3 space-y-2">
                                {Object.entries(statusFilters).map(([status, enabled]) => (
                                    <label key={status} className="flex items-center gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={enabled}
                                            onChange={(e) => setStatusFilters(prev => ({ ...prev, [status]: e.target.checked }))}
                                            className="rounded border-white/20 bg-white/5 text-primary-500 focus:ring-primary-500"
                                        />
                                        <span
                                            className="w-3 h-3 rounded-full"
                                            style={{ backgroundColor: STATUS_COLORS[status as keyof typeof STATUS_COLORS] }}
                                        />
                                        <span className="text-sm text-white/70 capitalize">{status.replace('_', ' ')}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Category Filters */}
                    <div className="border-b border-white/10">
                        <button
                            onClick={() => toggleSection('categories')}
                            className="w-full flex items-center justify-between p-3 hover:bg-white/5"
                        >
                            <span className="text-sm font-medium text-white/80">Categories</span>
                            {expandedSections.categories ? (
                                <ChevronDown className="w-4 h-4 text-white/40" />
                            ) : (
                                <ChevronRight className="w-4 h-4 text-white/40" />
                            )}
                        </button>
                        {expandedSections.categories && (
                            <div className="px-3 pb-3 space-y-2">
                                <div className="flex gap-2 mb-2">
                                    <button
                                        onClick={() => toggleAllCategories(true)}
                                        className="text-xs text-primary-400 hover:underline"
                                    >
                                        All
                                    </button>
                                    <span className="text-white/30">|</span>
                                    <button
                                        onClick={() => toggleAllCategories(false)}
                                        className="text-xs text-primary-400 hover:underline"
                                    >
                                        None
                                    </button>
                                </div>
                                {services.map(service => (
                                    <label key={service.service_code} className="flex items-center gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={categoryFilters[service.service_code] ?? true}
                                            onChange={(e) => setCategoryFilters(prev => ({ ...prev, [service.service_code]: e.target.checked }))}
                                            className="rounded border-white/20 bg-white/5 text-primary-500 focus:ring-primary-500"
                                        />
                                        <span className="text-sm text-white/70 truncate">{service.service_name}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* GeoJSON Layers */}
                    {mapLayers.length > 0 && (
                        <div className="border-b border-white/10">
                            <button
                                onClick={() => toggleSection('layers')}
                                className="w-full flex items-center justify-between p-3 hover:bg-white/5"
                            >
                                <span className="text-sm font-medium text-white/80">GeoJSON Layers</span>
                                {expandedSections.layers ? (
                                    <ChevronDown className="w-4 h-4 text-white/40" />
                                ) : (
                                    <ChevronRight className="w-4 h-4 text-white/40" />
                                )}
                            </button>
                            {expandedSections.layers && (
                                <div className="px-3 pb-3 space-y-2">
                                    <div className="flex gap-2 mb-2">
                                        <button
                                            onClick={() => toggleAllLayers(true)}
                                            className="text-xs text-primary-400 hover:underline"
                                        >
                                            All
                                        </button>
                                        <span className="text-white/30">|</span>
                                        <button
                                            onClick={() => toggleAllLayers(false)}
                                            className="text-xs text-primary-400 hover:underline"
                                        >
                                            None
                                        </button>
                                    </div>
                                    {mapLayers.map(layer => (
                                        <label key={layer.id} className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={layerFilters[layer.id] ?? true}
                                                onChange={(e) => setLayerFilters(prev => ({ ...prev, [layer.id]: e.target.checked }))}
                                                className="rounded border-white/20 bg-white/5 text-primary-500 focus:ring-primary-500"
                                            />
                                            <span
                                                className="w-3 h-3 rounded"
                                                style={{ backgroundColor: layer.fill_color, opacity: layer.fill_opacity }}
                                            />
                                            <span className="text-sm text-white/70 truncate">{layer.name}</span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Assignment Filter */}
                    <div>
                        <button
                            onClick={() => toggleSection('assignment')}
                            className="w-full flex items-center justify-between p-3 hover:bg-white/5"
                        >
                            <span className="text-sm font-medium text-white/80">Assignment</span>
                            {expandedSections.assignment ? (
                                <ChevronDown className="w-4 h-4 text-white/40" />
                            ) : (
                                <ChevronRight className="w-4 h-4 text-white/40" />
                            )}
                        </button>
                        {expandedSections.assignment && (
                            <div className="px-3 pb-3">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                                    <input
                                        type="text"
                                        placeholder="Search staff/department..."
                                        value={assignmentFilter}
                                        onChange={(e) => setAssignmentFilter(e.target.value)}
                                        className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/40 focus:outline-none focus:border-primary-500"
                                    />
                                    {assignmentFilter && (
                                        <button
                                            onClick={() => setAssignmentFilter('')}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded"
                                        >
                                            <X className="w-3 h-3 text-white/40" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Legend */}
            <div className="absolute bottom-4 left-4 z-10 bg-[#1a1a2e]/90 backdrop-blur-md rounded-lg border border-white/10 p-3">
                <div className="flex items-center gap-4 text-xs">
                    {Object.entries(STATUS_COLORS).map(([status, color]) => (
                        <div key={status} className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                            <span className="text-white/60 capitalize">{status.replace('_', ' ')}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

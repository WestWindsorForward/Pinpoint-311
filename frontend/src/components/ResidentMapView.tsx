import { useEffect, useRef, useState, useCallback } from 'react';
import { MapPin, Layers, ChevronDown, ChevronRight, X } from 'lucide-react';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { PublicServiceRequest } from '../types';

declare global {
    interface Window {
        google: typeof google;
    }
}

interface ResidentMapViewProps {
    apiKey: string;
    requests: PublicServiceRequest[];
    townshipBoundary?: object | null;
    defaultCenter?: { lat: number; lng: number };
    defaultZoom?: number;
    onRequestSelect?: (request: PublicServiceRequest) => void;
}

// Status colors
const STATUS_COLORS = {
    open: '#ef4444',        // red
    in_progress: '#f59e0b', // amber
    closed: '#22c55e',      // green
};

const STATUS_LABELS = {
    open: 'Open',
    in_progress: 'In Progress',
    closed: 'Resolved',
};

export default function ResidentMapView({
    apiKey,
    requests,
    townshipBoundary,
    defaultCenter = { lat: 40.3573, lng: -74.6672 },
    defaultZoom = 13,
    onRequestSelect,
}: ResidentMapViewProps) {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<google.maps.Map | null>(null);
    const markersRef = useRef<google.maps.Marker[]>([]);
    const clustererRef = useRef<MarkerClusterer | null>(null);
    const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

    // Filter state
    const [statusFilters, setStatusFilters] = useState({
        open: true,
        in_progress: true,
        closed: true,
    });

    // UI state
    const [isLoading, setIsLoading] = useState(true);
    const [showFilters, setShowFilters] = useState(false);
    const [expandedStatus, setExpandedStatus] = useState(true);

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
            mapTypeId: 'roadmap',
            mapTypeControl: true,
            mapTypeControlOptions: {
                style: window.google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
                position: window.google.maps.ControlPosition.TOP_LEFT,
                mapTypeIds: ['roadmap', 'satellite', 'hybrid'],
            },
            streetViewControl: false,
            fullscreenControl: true,
            zoomControl: true,
            zoomControlOptions: {
                position: window.google.maps.ControlPosition.RIGHT_BOTTOM,
            },
            styles: [
                { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
            ],
        });

        mapInstanceRef.current = map;
        infoWindowRef.current = new window.google.maps.InfoWindow();

        // Render township boundary and fit to it
        if (townshipBoundary) {
            renderBoundaryAndFit(map, townshipBoundary);
        }

        setIsLoading(false);
    }, [defaultCenter, defaultZoom, townshipBoundary]);

    const renderBoundaryAndFit = (map: google.maps.Map, boundary: any) => {
        try {
            const dataLayer = new window.google.maps.Data();
            dataLayer.addGeoJson(boundary);
            dataLayer.setStyle({
                fillColor: '#6366f1',
                fillOpacity: 0.05,
                strokeColor: '#6366f1',
                strokeWeight: 2,
                strokeOpacity: 0.6,
            });
            dataLayer.setMap(map);

            const bounds = new window.google.maps.LatLngBounds();
            dataLayer.forEach((feature) => {
                const geometry = feature.getGeometry();
                if (geometry) {
                    geometry.forEachLatLng((latlng) => {
                        bounds.extend(latlng);
                    });
                }
            });
            map.fitBounds(bounds);
        } catch (e) {
            console.error('Error rendering boundary:', e);
        }
    };

    // Update markers when filters or requests change
    useEffect(() => {
        if (!mapInstanceRef.current || !window.google) return;
        updateMarkers();
    }, [requests, statusFilters]);

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
            if (!statusFilters[r.status as keyof typeof statusFilters]) return false;
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
                    scale: 9,
                },
                title: request.service_name,
            });

            marker.addListener('click', () => {
                if (infoWindowRef.current) {
                    const statusColor = STATUS_COLORS[request.status as keyof typeof STATUS_COLORS];
                    const statusLabel = STATUS_LABELS[request.status as keyof typeof STATUS_LABELS] || request.status;

                    infoWindowRef.current.setContent(`
                        <div style="padding: 16px; max-width: 300px; font-family: system-ui, -apple-system, sans-serif;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                                <span style="font-size: 12px; color: #6366f1; font-family: monospace; font-weight: 600;">#${request.service_request_id.slice(-8)}</span>
                                <span style="font-size: 11px; padding: 4px 10px; border-radius: 9999px; background: ${statusColor}; color: white; font-weight: 600;">
                                    ${statusLabel}
                                </span>
                            </div>
                            <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 700; color: #1f2937;">${request.service_name}</h3>
                            <p style="margin: 0 0 12px 0; font-size: 13px; color: #4b5563; line-height: 1.5;">${request.description?.substring(0, 100) || 'No description'}${(request.description?.length || 0) > 100 ? '...' : ''}</p>
                            ${request.address ? `<p style="margin: 0 0 12px 0; font-size: 12px; color: #6b7280;">📍 ${request.address}</p>` : ''}
                            <p style="margin: 0; font-size: 11px; color: #9ca3af;">Reported ${new Date(request.requested_datetime).toLocaleDateString()}</p>
                            ${onRequestSelect ? `
                                <button 
                                    onclick="window.residentMapSelectRequest('${request.service_request_id}')"
                                    style="width: 100%; margin-top: 12px; padding: 10px 16px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; border: none; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer;"
                                >
                                    View Details
                                </button>
                            ` : ''}
                        </div>
                    `);
                    infoWindowRef.current.open(map, marker);
                }
            });

            return marker;
        });

        // Set up global callback
        if (onRequestSelect) {
            (window as any).residentMapSelectRequest = (requestId: string) => {
                const request = requests.find(r => r.service_request_id === requestId);
                if (request && onRequestSelect) {
                    infoWindowRef.current?.close();
                    onRequestSelect(request);
                }
            };
        }

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
                            fillOpacity: 0.95,
                            strokeColor: '#ffffff',
                            strokeWeight: 2,
                            scale: 16 + Math.min(count, 50) / 5,
                        },
                        label: {
                            text: String(count),
                            color: '#ffffff',
                            fontSize: '11px',
                            fontWeight: '700',
                        },
                        zIndex: 1000 + count,
                    });
                },
            },
        });
    };

    // Count requests by status
    const statusCounts = {
        open: requests.filter(r => r.status === 'open').length,
        in_progress: requests.filter(r => r.status === 'in_progress').length,
        closed: requests.filter(r => r.status === 'closed').length,
    };

    if (!apiKey) {
        return (
            <div className="h-full min-h-[400px] flex items-center justify-center bg-white/5 rounded-2xl border border-white/10">
                <div className="text-center p-8">
                    <MapPin className="w-12 h-12 mx-auto mb-4 text-white/30" />
                    <p className="text-white/60">Map not available</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full min-h-[400px] flex relative rounded-2xl overflow-hidden border border-white/10 shadow-xl">
            {/* Map Container */}
            <div className="flex-1 relative">
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#1a1a2e] z-10">
                        <div className="w-10 h-10 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                )}
                <div ref={mapRef} className="w-full h-full" />
            </div>

            {/* Filter Toggle Button */}
            <button
                onClick={() => setShowFilters(!showFilters)}
                className="absolute top-4 right-4 z-20 px-4 py-2 bg-white/95 backdrop-blur-md rounded-xl border border-gray-200 hover:bg-white transition-all shadow-lg flex items-center gap-2"
            >
                <Layers className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Filters</span>
                {!Object.values(statusFilters).every(v => v) && (
                    <span className="w-2 h-2 rounded-full bg-primary-500" />
                )}
            </button>

            {/* Filter Panel */}
            {showFilters && (
                <div className="absolute top-16 right-4 z-20 w-64 bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
                    <div className="p-3 border-b border-gray-100 flex items-center justify-between">
                        <h3 className="font-semibold text-gray-800 text-sm">Filter Requests</h3>
                        <button onClick={() => setShowFilters(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                            <X className="w-4 h-4 text-gray-400" />
                        </button>
                    </div>

                    <div className="p-3">
                        <button
                            onClick={() => setExpandedStatus(!expandedStatus)}
                            className="w-full flex items-center justify-between py-2"
                        >
                            <span className="text-sm font-medium text-gray-700">Status</span>
                            {expandedStatus ? (
                                <ChevronDown className="w-4 h-4 text-gray-400" />
                            ) : (
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                            )}
                        </button>

                        {expandedStatus && (
                            <div className="space-y-2 pt-2">
                                {Object.entries(statusFilters).map(([status, enabled]) => (
                                    <label key={status} className="flex items-center gap-3 cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            checked={enabled}
                                            onChange={(e) => setStatusFilters(prev => ({ ...prev, [status]: e.target.checked }))}
                                            className="w-4 h-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                                        />
                                        <span
                                            className="w-3 h-3 rounded-full"
                                            style={{ backgroundColor: STATUS_COLORS[status as keyof typeof STATUS_COLORS] }}
                                        />
                                        <span className="text-sm text-gray-600 flex-1">
                                            {STATUS_LABELS[status as keyof typeof STATUS_LABELS]}
                                        </span>
                                        <span className="text-xs text-gray-400">
                                            {statusCounts[status as keyof typeof statusCounts]}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Legend */}
            <div className="absolute bottom-4 left-4 z-10 bg-white/95 backdrop-blur-md rounded-xl border border-gray-200 px-4 py-3 shadow-lg">
                <div className="flex items-center gap-5 text-xs">
                    {Object.entries(STATUS_COLORS).map(([status, color]) => (
                        <div key={status} className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                            <span className="text-gray-600 font-medium">
                                {STATUS_LABELS[status as keyof typeof STATUS_LABELS]}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Request Count Badge */}
            <div className="absolute top-4 left-4 z-10 bg-white/95 backdrop-blur-md rounded-xl border border-gray-200 px-4 py-2 shadow-lg">
                <p className="text-sm font-medium text-gray-700">
                    <span className="text-primary-600 font-bold">{requests.filter(r => r.lat && r.long).length}</span> requests on map
                </p>
            </div>
        </div>
    );
}

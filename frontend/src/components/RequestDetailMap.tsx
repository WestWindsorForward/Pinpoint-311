import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MapPin, Package, Info } from 'lucide-react';
import { MapLayer } from '../services/api';

declare global {
    interface Window {
        google: typeof google;
    }
}

interface MatchedAsset {
    layer_name: string;
    asset_id?: string;
    asset_type?: string;
    properties?: Record<string, any>;
    distance_meters?: number;
}

interface RequestDetailMapProps {
    lat: number;
    lng: number;
    matchedAsset?: MatchedAsset | null;
    mapLayers: MapLayer[];
    apiKey: string;
}

export default function RequestDetailMap({
    lat,
    lng,
    matchedAsset,
    mapLayers,
    apiKey,
}: RequestDetailMapProps) {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<google.maps.Map | null>(null);
    const markerRef = useRef<google.maps.Marker | null>(null);
    const assetLayerRef = useRef<google.maps.Data | null>(null);
    const assetMarkerRef = useRef<google.maps.Marker | null>(null);
    const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

    const [isLoading, setIsLoading] = useState(true);
    const [showAssetInfo, setShowAssetInfo] = useState(true);

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
            if (markerRef.current) markerRef.current.setMap(null);
            if (assetMarkerRef.current) assetMarkerRef.current.setMap(null);
            if (assetLayerRef.current) assetLayerRef.current.setMap(null);
        };
    }, [apiKey]);

    const initMap = useCallback(() => {
        if (!mapRef.current || !window.google) return;

        const map = new window.google.maps.Map(mapRef.current, {
            center: { lat, lng },
            zoom: 18,
            mapTypeId: 'hybrid',
            mapTypeControl: true,
            mapTypeControlOptions: {
                style: window.google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
                position: window.google.maps.ControlPosition.TOP_LEFT,
                mapTypeIds: ['roadmap', 'satellite', 'hybrid'],
            },
            streetViewControl: true,
            fullscreenControl: true,
            zoomControl: true,
            zoomControlOptions: {
                position: window.google.maps.ControlPosition.LEFT_BOTTOM,
            },
        });

        mapInstanceRef.current = map;
        infoWindowRef.current = new window.google.maps.InfoWindow();
        setIsLoading(false);
    }, [lat, lng]);

    // Update map when coordinates change
    useEffect(() => {
        if (!mapInstanceRef.current || !window.google) return;

        const map = mapInstanceRef.current;
        map.setCenter({ lat, lng });

        // Clear old marker
        if (markerRef.current) markerRef.current.setMap(null);

        // Create request location marker
        markerRef.current = new window.google.maps.Marker({
            position: { lat, lng },
            map,
            icon: {
                path: window.google.maps.SymbolPath.CIRCLE,
                fillColor: '#ef4444',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 3,
                scale: 14,
            },
            title: 'Request Location',
            zIndex: 1000,
        });

        // Add pulsing effect via InfoWindow
        markerRef.current.addListener('click', () => {
            if (infoWindowRef.current) {
                infoWindowRef.current.setContent(`
                    <div style="padding: 12px; font-family: system-ui, -apple-system, sans-serif;">
                        <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #1f2937;">📍 Request Location</h4>
                        <p style="margin: 0; font-size: 12px; color: #6b7280;">Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}</p>
                    </div>
                `);
                infoWindowRef.current.open(map, markerRef.current);
            }
        });

    }, [lat, lng]);

    // Overlay matched asset
    useEffect(() => {
        if (!mapInstanceRef.current || !window.google) return;

        const map = mapInstanceRef.current;

        // Clear previous asset overlay
        if (assetLayerRef.current) assetLayerRef.current.setMap(null);
        if (assetMarkerRef.current) assetMarkerRef.current.setMap(null);

        if (!matchedAsset) return;

        // Find the layer that matches this asset
        const matchingLayer = mapLayers.find(l => l.name === matchedAsset.layer_name);

        if (matchingLayer?.geojson) {
            try {
                const geojson = matchingLayer.geojson as any;
                const dataLayer = new window.google.maps.Data();

                // Find the specific feature that matches the asset
                let targetFeature: any = null;

                if (geojson.type === 'FeatureCollection' && geojson.features) {
                    // Search for the matching feature by asset_id
                    targetFeature = geojson.features.find((f: any) => {
                        const props = f.properties || {};
                        return props.id === matchedAsset.asset_id ||
                            props.asset_id === matchedAsset.asset_id ||
                            props.OBJECTID === matchedAsset.asset_id ||
                            props.ID === matchedAsset.asset_id;
                    });
                }

                if (targetFeature) {
                    // Add just the matched feature
                    dataLayer.addGeoJson({
                        type: 'FeatureCollection',
                        features: [targetFeature]
                    });
                } else {
                    // Fallback: show the whole layer
                    dataLayer.addGeoJson(geojson);
                }

                // Style with emphasis (highlight the asset)
                dataLayer.setStyle(() => ({
                    fillColor: matchingLayer.fill_color || '#22c55e',
                    fillOpacity: 0.5,
                    strokeColor: '#22c55e',
                    strokeWeight: 3,
                    strokeOpacity: 1,
                }));

                dataLayer.setMap(map);
                assetLayerRef.current = dataLayer;

                // If it's a point feature, add a distinct marker
                if (targetFeature?.geometry?.type === 'Point') {
                    const coords = targetFeature.geometry.coordinates;
                    assetMarkerRef.current = new window.google.maps.Marker({
                        position: { lat: coords[1], lng: coords[0] },
                        map,
                        icon: {
                            path: window.google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
                            fillColor: '#22c55e',
                            fillOpacity: 1,
                            strokeColor: '#ffffff',
                            strokeWeight: 2,
                            scale: 8,
                            rotation: 0,
                        },
                        title: matchedAsset.layer_name,
                        zIndex: 999,
                    });
                }

            } catch (e) {
                console.error('Error overlaying matched asset:', e);
            }
        }
    }, [matchedAsset, mapLayers]);

    // Format property value for display
    const formatValue = (value: any): string => {
        if (value === null || value === undefined) return 'N/A';
        if (typeof value === 'boolean') return value ? 'Yes' : 'No';
        if (typeof value === 'number') return value.toLocaleString();
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    };

    // Get display label for property key
    const formatLabel = (key: string): string => {
        return key
            .replace(/_/g, ' ')
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
    };

    if (!apiKey) {
        return (
            <div className="h-full flex items-center justify-center bg-slate-900/50 rounded-lg border border-white/10">
                <div className="text-center p-4">
                    <MapPin className="w-8 h-8 mx-auto mb-2 text-white/30" />
                    <p className="text-white/50 text-sm">Maps not configured</p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative h-full rounded-lg overflow-hidden border border-white/10">
            {/* Map Container */}
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900 z-10">
                    <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                </div>
            )}
            <div ref={mapRef} className="w-full h-full" />

            {/* Matched Asset Info Panel */}
            {matchedAsset && (
                <div className="absolute bottom-3 left-3 right-3 z-10">
                    <div
                        className="bg-slate-900/95 backdrop-blur-md rounded-xl border border-green-500/30 shadow-xl overflow-hidden"
                        style={{ maxHeight: showAssetInfo ? '200px' : '44px', transition: 'max-height 0.3s ease' }}
                    >
                        {/* Header - Always visible */}
                        <button
                            onClick={() => setShowAssetInfo(!showAssetInfo)}
                            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/5 transition-colors"
                        >
                            <Package className="w-4 h-4 text-green-400 flex-shrink-0" />
                            <span className="text-sm font-medium text-green-400 flex-1 text-left truncate">
                                {matchedAsset.layer_name}
                            </span>
                            {matchedAsset.distance_meters && (
                                <span className="text-xs text-white/40 flex-shrink-0">
                                    {matchedAsset.distance_meters < 1
                                        ? '<1m away'
                                        : `${Math.round(matchedAsset.distance_meters)}m away`}
                                </span>
                            )}
                            <Info className={`w-4 h-4 text-white/40 flex-shrink-0 transition-transform ${showAssetInfo ? 'rotate-180' : ''}`} />
                        </button>

                        {/* Expandable Content */}
                        {showAssetInfo && (
                            <div className="px-3 pb-3 max-h-[140px] overflow-y-auto">
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                                    {/* Core fields first */}
                                    {matchedAsset.asset_id && (
                                        <>
                                            <span className="text-white/40">Asset ID</span>
                                            <span className="text-white/80 font-mono">{matchedAsset.asset_id}</span>
                                        </>
                                    )}
                                    {matchedAsset.asset_type && (
                                        <>
                                            <span className="text-white/40">Type</span>
                                            <span className="text-white/80">{matchedAsset.asset_type}</span>
                                        </>
                                    )}

                                    {/* All other properties */}
                                    {matchedAsset.properties && Object.entries(matchedAsset.properties)
                                        .filter(([key]) => !['id', 'asset_id', 'name', 'layer_name'].includes(key.toLowerCase()))
                                        .map(([key, value]) => (
                                            <React.Fragment key={key}>
                                                <span className="text-white/40 truncate" title={formatLabel(key)}>
                                                    {formatLabel(key)}
                                                </span>
                                                <span className="text-white/80 truncate" title={formatValue(value)}>
                                                    {formatValue(value)}
                                                </span>
                                            </React.Fragment>
                                        ))
                                    }
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Legend */}
            <div className="absolute top-3 right-3 z-10 bg-slate-900/90 backdrop-blur-md rounded-lg border border-white/10 px-3 py-2">
                <div className="flex items-center gap-3 text-xs">
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-red-500 shadow" />
                        <span className="text-white/60">Request</span>
                    </div>
                    {matchedAsset && (
                        <div className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full bg-green-500 shadow" />
                            <span className="text-white/60">Asset</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

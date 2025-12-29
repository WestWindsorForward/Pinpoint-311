import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MapPin, Crosshair, Loader2 } from 'lucide-react';

declare global {
    interface Window {
        google: typeof google;
        initGoogleMaps?: () => void;
    }
}

interface GoogleMapsLocationPickerProps {
    apiKey: string;
    townshipBoundary?: object | null; // GeoJSON boundary from OpenStreetMap
    defaultCenter?: { lat: number; lng: number };
    defaultZoom?: number;
    value?: { address: string; lat: number | null; lng: number | null };
    onChange: (location: { address: string; lat: number | null; lng: number | null }) => void;
    onOutOfBounds?: () => void; // Called when pin is placed outside boundary
    placeholder?: string;
    className?: string;
}

// Point-in-polygon check using ray casting algorithm
// GeoJSON coordinates are in [lng, lat] order
const isPointInPolygon = (lat: number, lng: number, polygon: number[][]): boolean => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        // GeoJSON coords: [longitude, latitude]
        const lngi = polygon[i][0];
        const lati = polygon[i][1];
        const lngj = polygon[j][0];
        const latj = polygon[j][1];

        const intersect = ((lati > lat) !== (latj > lat)) &&
            (lng < (lngj - lngi) * (lat - lati) / (latj - lati) + lngi);
        if (intersect) {
            inside = !inside;
        }
    }
    return inside;
};

// Check if a point is inside a GeoJSON geometry
const isPointInBoundary = (lat: number, lng: number, geojson: any): boolean => {
    if (!geojson || Object.keys(geojson).length === 0) return true; // No boundary = always valid

    try {
        // Handle different GeoJSON structures
        let polygons: number[][][] = [];

        if (geojson.type === 'FeatureCollection') {
            for (const feature of geojson.features || []) {
                if (feature.geometry?.type === 'Polygon') {
                    polygons.push(feature.geometry.coordinates[0]);
                } else if (feature.geometry?.type === 'MultiPolygon') {
                    for (const poly of feature.geometry.coordinates) {
                        polygons.push(poly[0]);
                    }
                }
            }
        } else if (geojson.type === 'Feature') {
            if (geojson.geometry?.type === 'Polygon') {
                polygons.push(geojson.geometry.coordinates[0]);
            } else if (geojson.geometry?.type === 'MultiPolygon') {
                for (const poly of geojson.geometry.coordinates) {
                    polygons.push(poly[0]);
                }
            }
        } else if (geojson.type === 'Polygon') {
            polygons.push(geojson.coordinates[0]);
        } else if (geojson.type === 'MultiPolygon') {
            for (const poly of geojson.coordinates) {
                polygons.push(poly[0]);
            }
        }

        if (polygons.length === 0) return true;

        // Check if point is in any of the polygons
        for (const polygon of polygons) {
            if (isPointInPolygon(lat, lng, polygon)) {
                return true;
            }
        }
        return false;
    } catch (e) {
        console.warn('Failed to check boundary:', e);
        return true; // On error, allow the point
    }
};


// Script loading state to prevent multiple loads
let googleMapsLoadingPromise: Promise<void> | null = null;

const loadGoogleMapsScript = (apiKey: string): Promise<void> => {
    if (window.google?.maps) {
        return Promise.resolve();
    }

    if (googleMapsLoadingPromise) {
        return googleMapsLoadingPromise;
    }

    googleMapsLoadingPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initGoogleMaps`;
        script.async = true;
        script.defer = true;

        window.initGoogleMaps = () => {
            resolve();
            delete window.initGoogleMaps;
        };

        script.onerror = () => {
            googleMapsLoadingPromise = null;
            reject(new Error('Failed to load Google Maps'));
        };

        document.head.appendChild(script);
    });

    return googleMapsLoadingPromise;
};

export default function GoogleMapsLocationPicker({
    apiKey,
    townshipBoundary,
    defaultCenter = { lat: 40.3573, lng: -74.6672 }, // Default to central NJ
    defaultZoom = 17,
    value,
    onChange,
    onOutOfBounds,
    placeholder = 'Search for an address...',
    className = '',
}: GoogleMapsLocationPickerProps) {

    const mapContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const markerRef = useRef<google.maps.Marker | null>(null);
    const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [inputValue, setInputValue] = useState(value?.address || '');
    const [isLocating, setIsLocating] = useState(false);
    const [isOutOfBounds, setIsOutOfBounds] = useState(false);


    // Sync input value with external value ONLY when address changes from parent
    useEffect(() => {
        if (value?.address !== undefined && value.address !== inputValue && value.address !== '') {
            setInputValue(value.address);
        }
    }, [value?.address]);

    // Reverse geocode coordinates to get formatted address
    const reverseGeocode = useCallback(async (lat: number, lng: number): Promise<string> => {
        return new Promise((resolve) => {
            const geocoder = new window.google.maps.Geocoder();
            geocoder.geocode({ location: { lat, lng } }, (results: google.maps.GeocoderResult[] | null, status: google.maps.GeocoderStatus) => {
                if (status === 'OK' && results && results[0]) {
                    resolve(results[0].formatted_address);
                } else {
                    resolve(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
                }
            });
        });
    }, []);

    // Place marker on map with a visible custom pin
    const placeMarker = useCallback((position: google.maps.LatLng | google.maps.LatLngLiteral) => {
        if (!mapRef.current) return;

        const positionObj = position instanceof window.google.maps.LatLng
            ? { lat: position.lat(), lng: position.lng() }
            : position;

        // Check if position is within boundary
        const inBounds = isPointInBoundary(positionObj.lat, positionObj.lng, townshipBoundary);
        setIsOutOfBounds(!inBounds);

        if (!inBounds && onOutOfBounds) {
            onOutOfBounds();
        }

        if (markerRef.current) {
            markerRef.current.setPosition(positionObj);
        } else {
            // Create a simple, standard Google Maps-style pin marker
            markerRef.current = new window.google.maps.Marker({
                position: positionObj,
                map: mapRef.current,
                draggable: true,
                animation: window.google.maps.Animation.DROP,
                icon: {
                    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40">
                            <defs>
                                <filter id="shadow" x="-50%" y="-20%" width="200%" height="150%">
                                    <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#000" flood-opacity="0.3"/>
                                </filter>
                            </defs>
                            <path d="M14 0 C6.268 0 0 6.268 0 14 C0 24.5 14 40 14 40 C14 40 28 24.5 28 14 C28 6.268 21.732 0 14 0 Z" 
                                  fill="#6366f1" filter="url(#shadow)"/>
                            <circle cx="14" cy="14" r="5" fill="white"/>
                        </svg>
                    `),
                    scaledSize: new window.google.maps.Size(28, 40),
                    anchor: new window.google.maps.Point(14, 40),
                },
            });

            // Handle marker drag
            markerRef.current.addListener('dragend', async () => {
                const pos = markerRef.current?.getPosition();
                if (pos) {
                    const inBounds = isPointInBoundary(pos.lat(), pos.lng(), townshipBoundary);
                    setIsOutOfBounds(!inBounds);

                    if (!inBounds && onOutOfBounds) {
                        onOutOfBounds();
                    }

                    const address = await reverseGeocode(pos.lat(), pos.lng());
                    setInputValue(address);
                    onChange({ address, lat: pos.lat(), lng: pos.lng() });
                }
            });
        }

        // Center map on marker
        mapRef.current.panTo(positionObj);
    }, [onChange, reverseGeocode, townshipBoundary, onOutOfBounds]);


    // Initialize Google Maps
    useEffect(() => {
        if (!apiKey) {
            setError('Google Maps API key is required');
            setIsLoading(false);
            return;
        }

        let isMounted = true;

        const initMap = async () => {
            try {
                await loadGoogleMapsScript(apiKey);

                if (!isMounted || !mapContainerRef.current || !inputRef.current) return;

                // Determine map center: value > boundary center > default
                let mapCenter = defaultCenter;

                // Try to get center from boundary data
                const geojson = townshipBoundary as any;
                if (geojson?.center?.lat && geojson?.center?.lng) {
                    mapCenter = { lat: geojson.center.lat, lng: geojson.center.lng };
                }

                // Value takes precedence if coordinates are set
                if (value?.lat && value?.lng) {
                    mapCenter = { lat: value.lat, lng: value.lng };
                }

                // Create map
                const mapOptions: google.maps.MapOptions = {
                    center: mapCenter,
                    zoom: defaultZoom,

                    mapTypeId: 'hybrid', // Satellite with labels
                    mapTypeControl: true,
                    mapTypeControlOptions: {
                        style: window.google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
                        position: window.google.maps.ControlPosition.TOP_RIGHT,
                        mapTypeIds: ['roadmap', 'satellite', 'hybrid'],
                    },
                    streetViewControl: false,
                    fullscreenControl: true,
                    fullscreenControlOptions: {
                        position: window.google.maps.ControlPosition.RIGHT_BOTTOM,
                    },
                    zoomControl: true,
                    zoomControlOptions: {
                        position: window.google.maps.ControlPosition.RIGHT_CENTER,
                    },
                };

                const map = new window.google.maps.Map(mapContainerRef.current, mapOptions);
                mapRef.current = map;

                // Add township boundary overlay if GeoJSON is provided
                if (townshipBoundary) {
                    try {
                        // Extract coordinates from GeoJSON for spotlight effect
                        let boundaryCoords: google.maps.LatLngLiteral[] = [];
                        const geojson = townshipBoundary as any;

                        // Get first polygon coordinates from GeoJSON
                        let coords: number[][] = [];
                        if (geojson.type === 'FeatureCollection' && geojson.features?.[0]) {
                            const geom = geojson.features[0].geometry;
                            if (geom?.type === 'Polygon') {
                                coords = geom.coordinates[0];
                            } else if (geom?.type === 'MultiPolygon') {
                                coords = geom.coordinates[0][0];
                            }
                        } else if (geojson.type === 'Feature') {
                            if (geojson.geometry?.type === 'Polygon') {
                                coords = geojson.geometry.coordinates[0];
                            } else if (geojson.geometry?.type === 'MultiPolygon') {
                                coords = geojson.geometry.coordinates[0][0];
                            }
                        } else if (geojson.type === 'Polygon') {
                            coords = geojson.coordinates[0];
                        } else if (geojson.type === 'MultiPolygon') {
                            coords = geojson.coordinates[0][0];
                        }

                        // Convert GeoJSON coords [lng, lat] to Google Maps format {lat, lng}
                        boundaryCoords = coords.map(([lng, lat]) => ({ lat, lng }));

                        if (boundaryCoords.length > 0) {
                            // Reverse the boundary coords to create counter-clockwise winding for the hole
                            // This makes the OUTSIDE dark and the INSIDE clear (spotlight effect)
                            const reversedBoundaryCoords = [...boundaryCoords].reverse();

                            // Create outer boundary (entire world) - clockwise
                            const worldBounds: google.maps.LatLngLiteral[] = [
                                { lat: -85, lng: -180 },
                                { lat: -85, lng: 180 },
                                { lat: 85, lng: 180 },
                                { lat: 85, lng: -180 },
                            ];

                            // Create polygon with hole - dark overlay outside boundary
                            new window.google.maps.Polygon({
                                paths: [worldBounds, reversedBoundaryCoords],
                                fillColor: '#000000',
                                fillOpacity: 0.4,
                                strokeColor: '#6366f1',
                                strokeWeight: 3,
                                strokeOpacity: 1,
                                map: map,
                                clickable: false,
                            });

                        } else {
                            // Fallback: just show boundary line without spotlight
                            map.data.addGeoJson(townshipBoundary);
                            map.data.setStyle({
                                fillColor: 'transparent',
                                fillOpacity: 0,
                                strokeColor: '#6366f1',
                                strokeWeight: 3,
                                strokeOpacity: 0.8,
                                clickable: false,
                            });
                        }
                    } catch (e) {
                        console.warn('Failed to add township boundary:', e);
                    }
                }



                // Create autocomplete
                const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
                    types: ['address'],
                    componentRestrictions: { country: 'us' },
                    fields: ['formatted_address', 'geometry', 'name'],
                });
                autocompleteRef.current = autocomplete;

                // Bias autocomplete to map bounds
                autocomplete.bindTo('bounds', map);

                // Handle place selection from autocomplete dropdown ONLY
                autocomplete.addListener('place_changed', () => {
                    const place = autocomplete.getPlace();

                    if (!place.geometry?.location) {
                        return;
                    }

                    const lat = place.geometry.location.lat();
                    const lng = place.geometry.location.lng();
                    const address = place.formatted_address || place.name || '';

                    setInputValue(address);
                    onChange({ address, lat, lng });

                    // Zoom to location
                    if (place.geometry.viewport) {
                        map.fitBounds(place.geometry.viewport);
                        // Set a max zoom after fitting bounds
                        const listener = map.addListener('idle', () => {
                            if (map.getZoom()! > 19) map.setZoom(19);
                            window.google.maps.event.removeListener(listener);
                        });
                    } else {
                        map.setCenter(place.geometry.location);
                        map.setZoom(19);
                    }

                    placeMarker(place.geometry.location);
                });

                // Handle map clicks for precise location selection
                map.addListener('click', async (e: google.maps.MapMouseEvent) => {
                    if (!e.latLng) return;

                    const lat = e.latLng.lat();
                    const lng = e.latLng.lng();

                    placeMarker(e.latLng);

                    // Reverse geocode to get address
                    const address = await reverseGeocode(lat, lng);
                    setInputValue(address);
                    onChange({ address, lat, lng });
                });

                // Place initial marker if value exists
                if (value?.lat && value?.lng) {
                    placeMarker({ lat: value.lat, lng: value.lng });
                }

                setIsLoading(false);
            } catch (err) {
                if (isMounted) {
                    setError('Failed to load Google Maps');
                    setIsLoading(false);
                }
            }
        };

        initMap();

        return () => {
            isMounted = false;
        };
    }, [apiKey]); // Only re-init when apiKey changes, not on every value change

    // Update marker position when value changes from parent
    useEffect(() => {
        if (mapRef.current && value?.lat && value?.lng && !isLoading) {
            placeMarker({ lat: value.lat, lng: value.lng });
        }
    }, [value?.lat, value?.lng, isLoading, placeMarker]);

    // Handle "Use my location" button
    const handleUseMyLocation = () => {
        if (!navigator.geolocation) {
            alert('Geolocation is not supported by your browser');
            return;
        }

        setIsLocating(true);

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;

                if (mapRef.current) {
                    const location = new window.google.maps.LatLng(lat, lng);
                    mapRef.current.setCenter(location);
                    mapRef.current.setZoom(19);
                    placeMarker(location);

                    const address = await reverseGeocode(lat, lng);
                    setInputValue(address);
                    onChange({ address, lat, lng });
                }

                setIsLocating(false);
            },
            (error) => {
                console.error('Geolocation error:', error);
                alert('Unable to get your location. Please enter an address manually.');
                setIsLocating(false);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    // Handle manual input changes - only update local state, not parent
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
        // Don't call onChange here - only update when:
        // 1. User selects from autocomplete dropdown
        // 2. User clicks on the map
        // 3. User drags the marker
        // 4. User uses "my location" button
    };

    if (error) {
        return (
            <div className={`p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-center ${className}`}>
                <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">{error}</p>
            </div>
        );
    }

    return (
        <div className={`space-y-4 ${className}`}>
            {/* Address Input with Autocomplete */}
            <div className="relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40 pointer-events-none z-10" />
                <input
                    ref={inputRef}
                    type="text"
                    placeholder={placeholder}
                    value={inputValue}
                    onChange={handleInputChange}
                    className="w-full h-12 pl-12 pr-14 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20 transition-all"
                    disabled={isLoading}
                    autoComplete="off"
                />
                {/* Use my location button */}
                <button
                    type="button"
                    onClick={handleUseMyLocation}
                    disabled={isLoading || isLocating}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 rounded-lg bg-primary-500/20 hover:bg-primary-500/30 transition-colors disabled:opacity-50"
                    title="Use my current location"
                >
                    {isLocating ? (
                        <Loader2 className="w-5 h-5 text-primary-400 animate-spin" />
                    ) : (
                        <Crosshair className="w-5 h-5 text-primary-400" />
                    )}
                </button>
            </div>

            {/* Map Container */}
            <div className="relative rounded-2xl overflow-hidden border-2 border-white/10 shadow-xl">
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 z-10">
                        <div className="text-center">
                            <div className="w-10 h-10 border-3 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                            <p className="text-sm text-white/60">Loading map...</p>
                        </div>
                    </div>
                )}
                <div
                    ref={mapContainerRef}
                    className="w-full h-72 md:h-96"
                    style={{ minHeight: '288px' }}
                />
            </div>

            {/* Out of bounds warning */}
            {isOutOfBounds && (
                <div className="flex items-center gap-2 text-sm bg-red-500/10 rounded-xl px-4 py-3 border border-red-500/30">
                    <span className="text-red-400">⚠️</span>
                    <span className="text-red-300">
                        This location is outside the township boundary. Please select a location within the jurisdiction.
                    </span>
                </div>
            )}

            {/* Instructions or Selected location info - shown BELOW the map */}
            {!value?.lat && !value?.lng && !isLoading ? (
                <div className="flex items-center justify-center gap-2 text-sm bg-white/5 rounded-xl px-4 py-3 border border-white/10">
                    <span className="text-primary-400">📍</span>
                    <span className="text-white/70">Tap the map to select a location, or search above</span>
                </div>
            ) : value?.lat && value?.lng ? (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-3 text-sm bg-white/5 rounded-xl px-4 py-3 border border-white/10">
                    <div className="flex items-center gap-2 text-white/60">
                        <MapPin className="w-4 h-4 text-primary-400 flex-shrink-0" />
                        <span className="font-mono text-xs sm:text-sm">
                            {value.lat.toFixed(6)}, {value.lng.toFixed(6)}
                        </span>
                    </div>
                    <span className="hidden sm:block text-white/20">•</span>
                    <span className="text-primary-400 text-xs sm:text-sm font-medium">
                        📍 Drag the pin to fine-tune
                    </span>
                </div>
            ) : null}

        </div>
    );
}


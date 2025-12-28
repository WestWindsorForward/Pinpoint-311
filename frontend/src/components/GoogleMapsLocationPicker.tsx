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
    defaultCenter?: { lat: number; lng: number };
    defaultZoom?: number;
    value?: { address: string; lat: number | null; lng: number | null };
    onChange: (location: { address: string; lat: number | null; lng: number | null }) => void;
    placeholder?: string;
    className?: string;
}

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
    defaultCenter = { lat: 40.3573, lng: -74.6672 }, // Default to central NJ
    defaultZoom = 17,
    value,
    onChange,
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

        if (markerRef.current) {
            markerRef.current.setPosition(positionObj);
        } else {
            // Create a custom marker with a polished pin icon
            markerRef.current = new window.google.maps.Marker({
                position: positionObj,
                map: mapRef.current,
                draggable: true,
                animation: window.google.maps.Animation.DROP,
                icon: {
                    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="60" viewBox="0 0 48 60">
                            <defs>
                                <linearGradient id="pinGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                    <stop offset="0%" style="stop-color:#818cf8"/>
                                    <stop offset="100%" style="stop-color:#4f46e5"/>
                                </linearGradient>
                                <filter id="shadow" x="-30%" y="-10%" width="160%" height="140%">
                                    <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000" flood-opacity="0.35"/>
                                </filter>
                            </defs>
                            <path d="M24 0 C10.745 0 0 10.745 0 24 C0 42 24 60 24 60 C24 60 48 42 48 24 C48 10.745 37.255 0 24 0 Z" 
                                  fill="url(#pinGradient)" filter="url(#shadow)"/>
                            <circle cx="24" cy="22" r="10" fill="white" opacity="0.95"/>
                            <circle cx="24" cy="22" r="5" fill="#4f46e5"/>
                        </svg>
                    `),
                    scaledSize: new window.google.maps.Size(48, 60),
                    anchor: new window.google.maps.Point(24, 60),
                },
            });

            // Handle marker drag
            markerRef.current.addListener('dragend', async () => {
                const pos = markerRef.current?.getPosition();
                if (pos) {
                    const address = await reverseGeocode(pos.lat(), pos.lng());
                    setInputValue(address);
                    onChange({ address, lat: pos.lat(), lng: pos.lng() });
                }
            });
        }

        // Center map on marker
        mapRef.current.panTo(positionObj);
    }, [onChange, reverseGeocode]);

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

                // Create map in SATELLITE/HYBRID mode
                const map = new window.google.maps.Map(mapContainerRef.current, {
                    center: value?.lat && value?.lng ? { lat: value.lat, lng: value.lng } : defaultCenter,
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
                });
                mapRef.current = map;

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
                {/* Instructions overlay - only when no location selected */}
                {!value?.lat && !value?.lng && !isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-md rounded-2xl px-6 py-5 text-center border border-white/10 shadow-2xl max-w-xs mx-4">
                            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-primary-500/20 flex items-center justify-center">
                                <MapPin className="w-6 h-6 text-primary-400" />
                            </div>
                            <p className="text-base font-medium text-white mb-1">
                                Select a Location
                            </p>
                            <p className="text-sm text-white/60">
                                Type an address above or tap anywhere on the map to place a pin
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Selected location info - mobile responsive */}
            {value?.lat && value?.lng && (
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
            )}
        </div>
    );
}

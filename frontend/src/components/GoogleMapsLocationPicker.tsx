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
    defaultZoom = 15,
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

    // Sync input value with external value
    useEffect(() => {
        if (value?.address !== undefined && value.address !== inputValue) {
            setInputValue(value.address);
        }
    }, [value?.address]);

    // Reverse geocode coordinates to get formatted address
    const reverseGeocode = useCallback(async (lat: number, lng: number): Promise<string> => {
        return new Promise((resolve) => {
            const geocoder = new window.google.maps.Geocoder();
            geocoder.geocode({ location: { lat, lng } }, (results, status) => {
                if (status === 'OK' && results && results[0]) {
                    resolve(results[0].formatted_address);
                } else {
                    resolve(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
                }
            });
        });
    }, []);

    // Place marker on map
    const placeMarker = useCallback((position: google.maps.LatLng | google.maps.LatLngLiteral) => {
        if (!mapRef.current) return;

        if (markerRef.current) {
            markerRef.current.setPosition(position);
        } else {
            markerRef.current = new window.google.maps.Marker({
                position,
                map: mapRef.current,
                draggable: true,
                animation: window.google.maps.Animation.DROP,
                icon: {
                    path: window.google.maps.SymbolPath.CIRCLE,
                    scale: 10,
                    fillColor: '#6366f1',
                    fillOpacity: 1,
                    strokeColor: '#ffffff',
                    strokeWeight: 3,
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
        mapRef.current.panTo(position);
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

                // Create map
                const map = new window.google.maps.Map(mapContainerRef.current, {
                    center: value?.lat && value?.lng ? { lat: value.lat, lng: value.lng } : defaultCenter,
                    zoom: defaultZoom,
                    styles: [
                        { elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
                        { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a2e' }] },
                        { elementType: 'labels.text.fill', stylers: [{ color: '#8b8b8b' }] },
                        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2d2d44' }] },
                        { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
                        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e0e1a' }] },
                        { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'on' }] },
                        { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1a2e1a' }] },
                    ],
                    mapTypeControl: false,
                    streetViewControl: false,
                    fullscreenControl: false,
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

                // Handle place selection
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
                    } else {
                        map.setCenter(place.geometry.location);
                        map.setZoom(18);
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
    }, [apiKey, defaultCenter, defaultZoom, onChange, placeMarker, reverseGeocode, value?.lat, value?.lng]);

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
                    mapRef.current.setZoom(18);
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

    // Handle manual input changes
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
        // Don't update parent until place is selected from autocomplete or map is clicked
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
        <div className={`space-y-3 ${className}`}>
            {/* Address Input with Autocomplete */}
            <div className="relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40 pointer-events-none z-10" />
                <input
                    ref={inputRef}
                    type="text"
                    placeholder={placeholder}
                    value={inputValue}
                    onChange={handleInputChange}
                    className="glass-input pl-12 pr-12 w-full"
                    disabled={isLoading}
                />
                {/* Use my location button */}
                <button
                    type="button"
                    onClick={handleUseMyLocation}
                    disabled={isLoading || isLocating}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50"
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
            <div className="relative rounded-xl overflow-hidden border border-white/10">
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/5 z-10">
                        <div className="text-center">
                            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                            <p className="text-sm text-white/50">Loading map...</p>
                        </div>
                    </div>
                )}
                <div
                    ref={mapContainerRef}
                    className="w-full h-64 md:h-80"
                    style={{ minHeight: '256px' }}
                />
                {/* Instructions overlay */}
                <div className="absolute bottom-2 left-2 right-2 text-center">
                    <p className="text-xs text-white/50 bg-black/50 rounded-lg px-3 py-1.5 inline-block backdrop-blur-sm">
                        Click on the map to select a precise location
                    </p>
                </div>
            </div>

            {/* Selected coordinates display */}
            {value?.lat && value?.lng && (
                <p className="text-xs text-white/40 text-center">
                    📍 {value.lat.toFixed(6)}, {value.lng.toFixed(6)}
                </p>
            )}
        </div>
    );
}

import { useState, useRef, useCallback } from "react";
import { GoogleMap, LoadScript, Marker, Autocomplete } from "@react-google-maps/api";

interface MapPickerProps {
  apiKey?: string | null;
  lat?: number | null;
  lng?: number | null;
  onChange: (coords: { lat: number; lng: number }, address?: string) => void;
}

const containerStyle = {
  width: "100%",
  height: "320px",
};

const libraries: ("places")[] = ["places"];

export function MapPicker({ apiKey, lat, lng, onChange }: MapPickerProps) {
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [markerPosition, setMarkerPosition] = useState({
    lat: lat ?? 40.299,
    lng: lng ?? -74.64,
  });

  if (!apiKey || apiKey.trim() === '') {
    return (
      <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-6">
        <div className="flex items-start gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="font-medium text-amber-900">Google Maps Not Configured</p>
            <p className="mt-1 text-sm text-amber-700">
              Location selection is disabled. Contact your administrator to add a Google Maps API key in Runtime Config.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleMapClick = async (event: google.maps.MapMouseEvent) => {
    if (!event.latLng) return;
    const newPos = { lat: event.latLng.lat(), lng: event.latLng.lng() };
    setMarkerPosition(newPos);
    let address: string | undefined = undefined;
    try {
      const geocoder = new google.maps.Geocoder();
      const result = await geocoder.geocode({ location: newPos });
      if (result.results && result.results.length > 0) {
        address = result.results[0].formatted_address;
      }
    } catch (e) {
      console.warn("Reverse geocode failed", e);
    }
    onChange(newPos, address);
  };

  const handlePlaceSelect = useCallback(() => {
    if (!autocomplete) return;
    
    const place = autocomplete.getPlace();
    
    if (!place.geometry || !place.geometry.location) {
      console.error('No geometry found for selected place');
      return;
    }

    const newPos = {
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng(),
    };

    setMarkerPosition(newPos);
    onChange(newPos, place.formatted_address);

    // Pan map to selected location
    if (map) {
      map.panTo(newPos);
      map.setZoom(15);
    }
  }, [autocomplete, map, onChange]);

  const onLoadAutocomplete = useCallback((auto: google.maps.places.Autocomplete) => {
    setAutocomplete(auto);
  }, []);

  const onLoadMap = useCallback((mapInstance: google.maps.Map) => {
    setMap(mapInstance);
  }, []);

  return (
    <LoadScript 
      googleMapsApiKey={apiKey} 
      libraries={libraries}
      onError={() => {
        console.error('Failed to load Google Maps. Check API key and billing.');
      }}
    >
      <div className="space-y-3">
        <Autocomplete
          onLoad={onLoadAutocomplete}
          onPlaceChanged={handlePlaceSelect}
        >
          <div className="relative">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search for your location (e.g., 'West Windsor Township, NJ')"
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 pr-10 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <svg 
              className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </Autocomplete>

        <GoogleMap
          mapContainerStyle={containerStyle}
          center={markerPosition}
          zoom={14}
          onClick={handleMapClick}
          onLoad={onLoadMap}
          options={{ 
            disableDefaultUI: true,
            zoomControl: true,
            mapTypeId: google.maps.MapTypeId.HYBRID,
          }}
        >
          <Marker position={markerPosition} />
        </GoogleMap>

        <p className="text-xs text-slate-500">
          💡 Search for your address above, or click on the map to set your location
        </p>
      </div>
    </LoadScript>
  );
}

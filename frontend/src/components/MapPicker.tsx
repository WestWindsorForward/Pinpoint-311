import { GoogleMap, LoadScript, Marker } from "@react-google-maps/api";

interface MapPickerProps {
  apiKey?: string | null;
  lat?: number | null;
  lng?: number | null;
  onChange: (coords: { lat: number; lng: number }) => void;
}

const containerStyle = {
  width: "100%",
  height: "320px",
};

export function MapPicker({ apiKey, lat, lng, onChange }: MapPickerProps) {
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

  const handleClick = (event: google.maps.MapMouseEvent) => {
    if (!event.latLng) return;
    onChange({ lat: event.latLng.lat(), lng: event.latLng.lng() });
  };

  const center = {
    lat: lat ?? 40.299,
    lng: lng ?? -74.64,
  };

  return (
    <LoadScript 
      googleMapsApiKey={apiKey} 
      libraries={["places"]}
      onError={() => {
        console.error('Failed to load Google Maps. Check API key and billing.');
      }}
    >
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={center}
        zoom={14}
        onClick={handleClick}
        options={{ disableDefaultUI: true }}
      >
        <Marker position={center} />
      </GoogleMap>
    </LoadScript>
  );
}

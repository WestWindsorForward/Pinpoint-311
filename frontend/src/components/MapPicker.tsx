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
  if (!apiKey) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
        Municipal admin: add a Google Maps key in Township Settings → Runtime Config.
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
    <LoadScript googleMapsApiKey={apiKey} libraries={["places"]}>
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

import { useMemo } from "react";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";

interface MapPickerProps {
  latitude: number | null;
  longitude: number | null;
  onChange: (lat: number, lng: number) => void;
}

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

export default function MapPicker({ latitude, longitude, onChange }: MapPickerProps) {
  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="card" style={{ background: "#fff7ed", border: "1px solid #fed7aa" }}>
        <p style={{ margin: 0 }}>
          Google Maps API key not configured. Township IT can set <code>VITE_GOOGLE_MAPS_API_KEY</code> in <code>.env.local</code>
          to enable interactive mapping. For now, please enter the street address manually.
        </p>
      </div>
    );
  }

  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: GOOGLE_MAPS_API_KEY });

  const center = useMemo(
    () => ({
      lat: latitude ?? 40.2995,
      lng: longitude ?? -74.6197
    }),
    [latitude, longitude]
  );

  if (!isLoaded) {
    return <div className="card">Loading map...</div>;
  }

  return (
    <div style={{ height: "320px", borderRadius: "16px", overflow: "hidden" }}>
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "100%" }}
        center={center}
        zoom={12}
        onClick={(event) => {
          const latLng = event.latLng;
          if (latLng) {
            onChange(latLng.lat(), latLng.lng());
          }
        }}
        options={{ streetViewControl: false, mapTypeControl: false }}
      >
        {latitude !== null && longitude !== null && <Marker position={{ lat: latitude, lng: longitude }} />}
      </GoogleMap>
    </div>
  );
}

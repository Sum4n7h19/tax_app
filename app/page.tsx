"use client";

import dynamic from "next/dynamic";

const MapView = dynamic(() => import("../components/Map_View"), {
  ssr: false, // Leaflet must run only on client
});

export default function Home() {
  return <MapView />;
}

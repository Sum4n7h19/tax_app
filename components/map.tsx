"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export default function MeasureMap() {
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (mapRef.current) return; // already initialized

    // 1️⃣ Init Leaflet map
    const map = L.map("map", {
      center: [12.97, 77.59],
      zoom: 12,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    mapRef.current = map;

    // 2️⃣ Inject leaflet-measure CSS
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "/leaflet-measure/leaflet-measure.css"; // ⬅️ make sure this path exists
    css.id = "leaflet-measure-css";
    document.head.appendChild(css);

    // 3️⃣ Inject leaflet-measure JS
    const script = document.createElement("script");
    script.src = "/leaflet-measure/leaflet-measure.js"; // ⬅️ make sure this path exists
    script.async = true;
    script.id = "leaflet-measure-js";

    script.onload = () => {
      // @ts-ignore
      const MeasureControl = (L as any).Control?.Measure;

      if (!MeasureControl) {
        console.error("❌ L.Control.Measure is not defined. Check JS path.");
        return;
      }

      // 4️⃣ Add measure control
      // @ts-ignore
      const measureControl = new MeasureControl({
        primaryLengthUnit: "meters",
        secondaryLengthUnit: "kilometers",
        primaryAreaUnit: "sqmeters",
        secondaryAreaUnit: "hectares",
      });

      mapRef.current?.addControl(measureControl);

      // Optional: log to verify control is there
      console.log("✅ Measure control added");

      // 5️⃣ Fix: enable/disable dragging during measure
      mapRef.current?.on("measurestart", () => {
        mapRef.current?.dragging.disable();
      });

      mapRef.current?.on("measurefinish measureclear", () => {
        mapRef.current?.dragging.enable();
      });
    };

    script.onerror = () => {
      console.error("❌ Failed to load leaflet-measure.js. Check the file path.");
    };

    document.body.appendChild(script);

    // 6️⃣ Cleanup
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const oldCss = document.getElementById("leaflet-measure-css");
      if (oldCss) oldCss.remove();

      const oldScript = document.getElementById("leaflet-measure-js");
      if (oldScript) oldScript.remove();
    };
  }, []);

  return (
    <div
      id="map"
      style={{ height: "100vh", width: "100%" }}
    />
  );
}

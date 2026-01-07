import React, { useState } from "react";

export default function App() {
  const [view, setView] = useState<"onhand" | "reorder" | "settings">("onhand");

  return (
    <div style={{ fontFamily: "system-ui", padding: 16 }}>
      <h1 style={{ color: "#E31837" }}>Inventory</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setView("onhand")}>On‑Hand</button>
        <button onClick={() => setView("reorder")}>Reorder</button>
        <button onClick={() => setView("settings")}>Settings</button>
      </div>

      {view === "onhand" && <OnHand />}
      {view === "reorder" && <Reorder />}
      {view === "settings" && <Settings />}
    </div>
  );
}

function OnHand() {
  return <div>On‑Hand counting by location goes here.</div>;
}

function Reorder() {
  return <div>Reorder list (global PAR vs total on‑hand).</div>;
}

function Settings() {
  return <div>Products, locations, PAR, and assignments.</div>;
}

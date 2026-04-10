<div align="center">

# 🌊 KADAL YATRI
### Maritime Safety & Intelligence System

*Empowering small-scale fishers through mesh-networked safety & real-time maritime intelligence.*

[![Live Demo](https://img.shields.io/badge/Live%20Demo-kadal--yatrii.vercel.app-blue?style=for-the-badge&logo=vercel)](https://kadal-yatrii.vercel.app/)
[![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20Mobile-green?style=for-the-badge)]()
[![Stack](https://img.shields.io/badge/Stack-Next.js%20%7C%20LoRa%20%7C%20GPS-orange?style=for-the-badge)]()
[![Region](https://img.shields.io/badge/Region-Kerala%2C%20India-red?style=for-the-badge)]()

---

</div>

## 📖 Overview

**Kadal Yatri** (കടൽ യാത്രി — *Seafarer* in Malayalam) is a low-cost, real-time emergency communication and rescue guidance system built for small boats and fishermen operating along the Kerala coastline. It works **without internet connectivity** using LoRa mesh radio, making it viable for remote sea conditions where cellular coverage is absent.

The system bridges two worlds — the fisherman's mobile app at sea and a shore-based command center — enabling SOS transmission, live vessel telemetry, weather intelligence, and fish market price broadcast all over a single platform.

---

## 🚨 Core Features

### 1. Distress Detection & Transmission
- Manual SOS via button press from the fisherman's app
- Automatic SOS trigger via motion anomaly detection (MPU6050 IMU sensor)
- Transmits GPS location (with coordinate fallback) and unique Vessel ID
- Operates over **LoRa radio** — no internet or cellular required

### 2. Vessel Telemetry
- Real-time monitoring of battery level, wave height, and heading for each vessel
- Live status indicators (Active / Distress) for the entire registered fleet
- Vessel IDs: Agnivesh (V1), Karthik (V2), Megha (V3), Amrutha (V4)

### 3. Command Center Dashboard
- Surveillance map with live vessel positions
- AIS (Automatic Identification System) ship traffic overlay
- Live SOS queue with distress management tools
- INCOIS high-wave advisory integration for the Kerala coast
- Potential Fishing Zone (PFZ) satellite broadcast publishing

### 4. Fish Market Price Broadcaster
- Real-time fish prices pushed over the LoRa mesh to vessels at sea
- Covers major landing centers: Vizhinjam, Kochi, Neendakara, Kozhikode, Kochi (Inland)
- Species covered include Ayala (Indian Mackerel), Avoli (Black Pomfret), Koonthal (Squid), and more

### 5. Fisherman Mobile App
- Mobile-first interface designed for low-literacy, high-stress sea conditions
- Sea state alerts and weather warnings
- One-tap SOS button
- Live market prices received from command center

---

## 🖥️ Application Portals

| Portal | URL | Description |
|---|---|---|
| 🏠 Home | `/` | Landing page with portal selection |
| 🌊 Fisherman App | `/fisherman` | Mobile-first app for vessel crew |
| 🛰️ Command Center | `/dashboard` | Shore-based monitoring & dispatch hub |

---

## 🛠️ System Architecture

```
[ Vessel Hardware ]                   [ Shore / Cloud ]
 ┌─────────────────┐                  ┌──────────────────────┐
 │  MPU6050 (IMU)  │──auto-trigger──▶ │                      │
 │  GPS Module     │──location──────▶ │   LoRa Base Station  │──▶ Command Dashboard
 │  SOS Button     │──manual SOS────▶ │                      │        (Web App)
 │  LoRa Module    │◀──prices/alerts──│                      │
 └─────────────────┘                  └──────────────────────┘
         │
         ▼
  Fisherman Mobile App
  (PWA / Web Interface)
```

**Communication stack:** LoRa (Long Range radio) → LoRa Gateway → WebSocket/HTTP → Next.js Frontend

---

## 📡 Hardware Components

| Component | Purpose |
|---|---|
| **LoRa Module** | Long-range, low-power radio communication (no internet needed) |
| **GPS Module** | Real-time vessel location |
| **MPU6050 IMU** | Accelerometer/gyroscope for automatic capsize/distress detection |
| **SOS Button** | Manual emergency trigger |
| **Microcontroller** | Arduino / ESP32 for sensor integration and LoRa transmission |

---

## 🌐 Tech Stack (Web App)

| Layer | Technology |
|---|---|
| Frontend | Next.js (React) |
| Styling | Tailwind CSS |
| Deployment | Vercel |
| Maps | Leaflet / AIS overlay |
| Real-time | WebSockets / polling |
| Data Sources | INCOIS (wave advisories), AIS feed, local market price API |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/kadal-yatri.git
cd kadal-yatri

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Variables

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_MAP_API_KEY=your_map_api_key
NEXT_PUBLIC_AIS_FEED_URL=your_ais_feed_endpoint
NEXT_PUBLIC_LORA_GATEWAY_URL=your_lora_gateway_url
INCOIS_API_KEY=your_incois_api_key
```

---

## 📱 Usage

### For Fishermen
1. Open the Fisherman App at `/fisherman`
2. Select your registered vessel
3. Monitor sea state alerts and weather warnings
4. Check live fish prices from nearby landing centers
5. Press **SOS** in an emergency — location and vessel ID are transmitted instantly

### For Coast Guard / Command Operators
1. Open the Command Center at `/dashboard`
2. Monitor all active vessels on the surveillance map
3. Respond to incoming SOS events from the distress queue
4. Broadcast weather advisories and PFZ zones to the fleet
5. Push updated fish market prices to all vessels

---

## 🗺️ Coverage Area

Currently deployed for the **Kerala coastline, India**, covering landing centers at:
- Vizhinjam
- Kochi
- Neendakara
- Kozhikode

---


<div align="center">

**KADAL YATRI v1.0 · MARITIME SAFETY SYSTEM · KERALA, INDIA**

*Built with ❤️ for the fishermen of Kerala*

</div>`

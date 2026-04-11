#include <SPI.h>
#include <LoRa.h>
#include <Wire.h>
#include <MPU6050.h>
#include <TinyGPS++.h>

// -------- LORA PINS --------
#define SS 5
#define RST 14
#define DIO0 26

// -------- SWITCH --------
#define SWITCH_PIN 4

// -------- GPS --------
#define RXD2 16
#define TXD2 17

TinyGPSPlus gps;
HardwareSerial gpsSerial(2);

// -------- MPU --------
MPU6050 mpu;

// -------- VARIABLES --------
String boatID = "boat_1";

bool lastSwitchState = HIGH;
bool sosSent = false;
bool mpuSOSsent = false;
bool usingFallback = false;   // 🔥 for no spam

// Fallback location
float fallbackLat = 10.039036;
float fallbackLon = 76.322670;

// ---------------- SEND SOS ----------------
void sendSOS(float lat, float lon, String source) {

  String payload = "{";
  payload += "\"id\":\"" + boatID + "\",";
  payload += "\"lat\":" + String(lat, 6) + ",";
  payload += "\"lon\":" + String(lon, 6) + ",";
  payload += "\"source\":\"" + source + "\"";
  payload += "}";

  LoRa.beginPacket();
  LoRa.print(payload);
  LoRa.endPacket();

  Serial.println("📡 Sent:");
  Serial.println(payload);
}

// ---------------- SETUP ----------------
void setup() {
  Serial.begin(115200);

  pinMode(SWITCH_PIN, INPUT_PULLUP);

  // GPS
  gpsSerial.begin(9600, SERIAL_8N1, RXD2, TXD2);

  // MPU
  Wire.begin(21, 22);
  mpu.initialize();

  if (mpu.testConnection()) {
    Serial.println("✅ MPU6050 connected");
  } else {
    Serial.println("❌ MPU6050 failed");
  }

  // LoRa
  SPI.begin(18, 19, 23, SS);
  LoRa.setPins(SS, RST, DIO0);

  if (!LoRa.begin(433E6)) {
    Serial.println("❌ LoRa init failed");
    while (1);
  }

  Serial.println("✅ Sender Ready");
}

// ---------------- LOOP ----------------
void loop() {

  // -------- READ GPS --------
  while (gpsSerial.available()) {
    gps.encode(gpsSerial.read());
  }

  float lat, lon;

  if (gps.location.isValid()) {
    lat = gps.location.lat();
    lon = gps.location.lng();

    if (usingFallback) {
      Serial.println("✅ GPS FIX ACQUIRED");
      usingFallback = false;
    }

  } else {
    lat = fallbackLat;
    lon = fallbackLon;

    if (!usingFallback) {
      Serial.println("⚠️ Using FALLBACK (No GPS fix)");
      usingFallback = true;
    }
  }

  // -------- SWITCH (SEND ONCE) --------
  bool currentSwitchState = digitalRead(SWITCH_PIN);

  if (currentSwitchState == LOW && lastSwitchState == HIGH && !sosSent) {
    Serial.println("🚨 SWITCH SOS TRIGGERED");

    sendSOS(lat, lon, "manual");

    sosSent = true;
  }

  if (currentSwitchState == HIGH) {
    sosSent = false;
  }

  lastSwitchState = currentSwitchState;

  // -------- MPU AUTO SOS --------
  int16_t ax, ay, az;
  int16_t gx, gy, gz;

  mpu.getMotion6(&ax, &ay, &az, &gx, &gy, &gz);

  float accel = sqrt(ax * ax + ay * ay + az * az) / 16384.0;
  float gyro = abs(gx) + abs(gy) + abs(gz);

  if ((accel > 2.5 || gyro > 30000) && !mpuSOSsent) {
    Serial.println("⚠️ STORM DETECTED → AUTO SOS");

    sendSOS(lat, lon, "mpu");

    mpuSOSsent = true;
  }

  // Reset MPU trigger
  if (accel < 1.5 && gyro < 10000) {
    mpuSOSsent = false;
  }

  delay(200);
}
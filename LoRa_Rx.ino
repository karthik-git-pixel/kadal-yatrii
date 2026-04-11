#include <WiFi.h>
#include <PubSubClient.h>
#include <SPI.h>
#include <LoRa.h>

// -------- WIFI --------
const char* ssid = "Narzo";
const char* password = "12344321";

// -------- MQTT --------
const char* mqtt_server = "broker.hivemq.com";
const char* topic = "kadal/sos";

WiFiClient espClient;
PubSubClient client(espClient);

// -------- LORA PINS --------
#define SS 5
#define RST 14
#define DIO0 26

// ---------------- MQTT RECONNECT ----------------
void reconnect() {
  while (!client.connected()) {
    Serial.print("Connecting MQTT...");

    if (client.connect("ESP32Receiver")) {
      Serial.println("connected");
    } else {
      Serial.print("failed: ");
      Serial.println(client.state());
      delay(2000);
    }
  }
}

// ---------------- SEND TO MQTT ----------------
void publishSOS(String id, float lat, float lon, String source) {

  String payload = "{";
  payload += "\"id\":\"" + id + "\",";
  payload += "\"lat\":" + String(lat, 6) + ",";
  payload += "\"lon\":" + String(lon, 6) + ",";
  payload += "\"source\":\"" + source + "\"";
  payload += "}";

  if (client.publish(topic, payload.c_str())) {
    Serial.println("✅ MQTT Sent:");
    Serial.println(payload);
  } else {
    Serial.println("❌ MQTT Failed");
  }
}

// ---------------- SETUP ----------------
void setup() {
  Serial.begin(115200);

  // WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n✅ WiFi Connected");

  client.setServer(mqtt_server, 1883);

  // LoRa
  SPI.begin(18, 19, 23, SS);
  LoRa.setPins(SS, RST, DIO0);

  if (!LoRa.begin(433E6)) {
    Serial.println("❌ LoRa Init Failed");
    while (1);
  }

  Serial.println("✅ LoRa Receiver Ready");
}

// ---------------- LOOP ----------------
void loop() {

  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  int packetSize = LoRa.parsePacket();

  if (packetSize) {
    String received = "";

    while (LoRa.available()) {
      received += (char)LoRa.read();
    }

    Serial.println("\n🚨 RAW RECEIVED:");
    Serial.println(received);

    // -------- PARSE JSON --------
    String id = "";
    String source = "";
    float lat = 0.0;
    float lon = 0.0;

    int idIndex = received.indexOf("\"id\":\"");
    int latIndex = received.indexOf("\"lat\":");
    int lonIndex = received.indexOf("\"lon\":");
    int sourceIndex = received.indexOf("\"source\":\"");

    if (idIndex != -1 && latIndex != -1 && lonIndex != -1 && sourceIndex != -1) {

      int idEnd = received.indexOf("\"", idIndex + 6);
      int latEnd = received.indexOf(",", latIndex);
      int lonEnd = received.indexOf(",", lonIndex);
      int sourceEnd = received.indexOf("\"", sourceIndex + 10);

      id = received.substring(idIndex + 6, idEnd);
      lat = received.substring(latIndex + 6, latEnd).toFloat();
      lon = received.substring(lonIndex + 6, lonEnd).toFloat();
      source = received.substring(sourceIndex + 10, sourceEnd);

      Serial.println("🚨 SOS RECEIVED");
      Serial.print("Boat ID: "); Serial.println(id);
      Serial.print("Latitude: "); Serial.println(lat, 6);
      Serial.print("Longitude: "); Serial.println(lon, 6);
      Serial.print("Source: "); Serial.println(source);

      publishSOS(id, lat, lon, source);
    } else {
      Serial.println("❌ Invalid data format");
    }
  }
}
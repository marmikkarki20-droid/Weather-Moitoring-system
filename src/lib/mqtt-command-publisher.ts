import mqtt from 'mqtt'

let client: mqtt.MqttClient | undefined
function connection() {
  if (!client) client = mqtt.connect(`mqtt://${process.env.MQTT_HOST || 'localhost'}:${process.env.MQTT_PORT || '1883'}`, { reconnectPeriod: 2_000, connectTimeout: 3_000, username: process.env.MQTT_USERNAME || undefined, password: process.env.MQTT_PASSWORD || undefined })
  return client
}
export async function publishSimulationCommand(deviceId: string, payload: Record<string, unknown>) {
  const topic = `${process.env.MQTT_TOPIC_ROOT || 'weathergrid'}/devices/${deviceId}/commands`
  await new Promise<void>((resolve, reject) => connection().publish(topic, JSON.stringify(payload), { qos: 1, retain: false }, error => error ? reject(error) : resolve()))
}

import * as migration_20260902_060317_initial from './20260902_060317_initial';
import * as migration_20260902_061538_weather_data_model from './20260902_061538_weather_data_model';
import * as migration_20260902_100138_edge_gateway_ingestion from './20260902_100138_edge_gateway_ingestion';
import * as migration_20260902_103612_alerts_and_offline_detection from './20260902_103612_alerts_and_offline_detection';
import * as migration_20260902_114831_simulation_lab from './20260902_114831_simulation_lab';
import * as migration_20260902_120553_report_export_audit from './20260902_120553_report_export_audit';
import * as migration_20260902_162941_notifications_outbox from './20260902_162941_notifications_outbox';

export const migrations = [
  {
    up: migration_20260902_060317_initial.up,
    down: migration_20260902_060317_initial.down,
    name: '20260902_060317_initial',
  },
  {
    up: migration_20260902_061538_weather_data_model.up,
    down: migration_20260902_061538_weather_data_model.down,
    name: '20260902_061538_weather_data_model',
  },
  {
    up: migration_20260902_100138_edge_gateway_ingestion.up,
    down: migration_20260902_100138_edge_gateway_ingestion.down,
    name: '20260902_100138_edge_gateway_ingestion',
  },
  {
    up: migration_20260902_103612_alerts_and_offline_detection.up,
    down: migration_20260902_103612_alerts_and_offline_detection.down,
    name: '20260902_103612_alerts_and_offline_detection',
  },
  {
    up: migration_20260902_114831_simulation_lab.up,
    down: migration_20260902_114831_simulation_lab.down,
    name: '20260902_114831_simulation_lab',
  },
  {
    up: migration_20260902_120553_report_export_audit.up,
    down: migration_20260902_120553_report_export_audit.down,
    name: '20260902_120553_report_export_audit',
  },
  {
    up: migration_20260902_162941_notifications_outbox.up,
    down: migration_20260902_162941_notifications_outbox.down,
    name: '20260902_162941_notifications_outbox'
  },
];

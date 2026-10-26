export type Color = [number, number, number];
export type Effect = "static" | "breathing" | "cycle" | "rainbow";
export type Layer = "base" | "fn";
export interface KeyStyle {
  color: Color;
  effect: Effect;
  speed: number;
  pause: number;
}
export interface Frame {
  keys: number[];
  duration: number;
}
export interface MacroEvent {
  code: number;
  down: boolean;
  delayMs: number;
}
export interface MacroBinding {
  key: number;
  layer: Layer;
  name: string;
  repeat: number;
  events: MacroEvent[];
}
export interface Binding {
  key: number;
  layer: Layer;
  action: number;
}
export interface FirmwareTuning {
  brightness: number;
  speed: number;
  colors: [Color, Color];
  randomColors: boolean;
}
export interface Profile {
  version: 1;
  id: string;
  name: string;
  description: string;
  brightness: number;
  keys: KeyStyle[];
  frames: Frame[];
  bindings: Binding[];
  macros?: MacroBinding[];
  firmware?: { mode: number; tuning?: FirmwareTuning };
}
export interface Device {
  inputMonitoringRequired?: boolean;
  identity?: string | null;
  connected: boolean;
  supported: boolean;
  revision: string | null;
  active: number | null;
  message: string;
}
export interface Hardware {
  base: number[];
  function: number[];
  config: Profile | null;
  notice: string | null;
}
export interface Key {
  name: string;
  label: string;
  x: number;
  y: number;
  width: number;
  code: number;
}

export interface HardwareSlot {
  slot: number;
  data: Hardware | null;
  error: string | null;
}
export interface HardwareScan {
  device: Device;
  profiles: HardwareSlot[];
}

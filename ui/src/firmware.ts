import { layout } from "./model.ts";
import type { Profile, FirmwareTuning } from "./model.ts";

// Reaction names describe the bundled firmware's handlers, not OEM marketing names.
export const firmwareModes: readonly {mode:number;name:string;limits?:[number,number]}[] = [
  {mode:0,name:"Встроенный 1"},
  {mode:1,name:"Встроенный 2"},
  {mode:2,name:"Встроенный 3"},
  {mode:3,name:"Встроенный 4"},
  {mode:4,name:"Встроенный 5"},
  {mode:6,name:"Лучи вдоль ряда",limits:[10,100]},
  {mode:7,name:"Крест от нажатия",limits:[0,100]},
  {mode:8,name:"Отклик клавиши",limits:[10,110]},
  {mode:9,name:"Расходящаяся волна",limits:[0,110]},
  {mode:10,name:"Вспышка вокруг клавиши",limits:[10,100]},
];

export function defaultFirmwareTuning(mode:number): FirmwareTuning | undefined {
  if(!firmwareModes.find(item=>item.mode===mode)?.limits) return undefined;
  return {brightness:20,speed:mode<=8?50:30,colors:[[0,220,255],[255,32,160]],randomColors:false};
}

export function switchFirmware(profile:Profile,mode:number):Profile {
  const spec=firmwareModes.find(item=>item.mode===mode);
  if(!spec) throw new Error("Неизвестный встроенный эффект");
  const next={...profile,firmware:{mode,tuning:defaultFirmwareTuning(mode)}};
  if(spec.limits && profile.firmware?.tuning) {
    next.firmware.tuning={...profile.firmware.tuning,speed:Math.max(spec.limits[0],Math.min(spec.limits[1],profile.firmware.tuning.speed))};
  }
  return next;
}

export function firmwarePresets(): Profile[] {
  return firmwareModes.map(({mode,name})=>{
    const tuning=defaultFirmwareTuning(mode);
    return {
    version:1,id:`firmware-${mode}`,name,description:"Заводской эффект клавиатуры",brightness:100,
    keys:layout.map(()=>({color:[0,0,0],effect:"static",speed:1,pause:0})),
    frames:[{keys:layout.map((_,i)=>i),duration:1}],bindings:[],macros:[],firmware:tuning?{mode,tuning}:{mode},
  };});
}

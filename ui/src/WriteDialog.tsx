import { useEffect, useMemo, useRef } from "react";
import { X, Usb, HardDrive, Check, ArrowRight } from "lucide-react";
import { matchStoredLighting } from "./device";
import { firmwareModes } from "./firmware";
import { layout, hex } from "./model";
import type { Profile, HardwareSlot, Device } from "./model";

export default function WriteDialog({profile,profiles,device,slots,busy,onClose,onWrite,onOpen,onActivate}: {
  profile: Profile;
  profiles: Profile[];
  device: Device;
  slots: HardwareSlot[];
  busy: boolean;
  onClose: () => void;
  onWrite: (slot:number) => void;
  onOpen: (slot:number) => void;
  onActivate: (slot:number) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const connected = device.connected && device.supported;
  const names = useMemo(()=>new Map(slots.map(entry=>[entry.slot, entry.data?.config ? matchStoredLighting(entry.data.config,profiles)?.name : undefined])),[slots,profiles]);
  useEffect(()=>{dialog.current?.showModal();},[]);
  return <dialog ref={dialog} className="write-dialog" aria-labelledby="write-title" onCancel={onClose}>
    <div className="section-heading"><h2 id="write-title">Записать «{profile.name}»</h2><button className="icon-button" autoFocus aria-label="Закрыть выбор профиля" onClick={onClose}><X size={18}/></button></div>
    <p className="write-explanation">{profile.firmware ? profile.firmware.tuning ? "Выберите профиль 1–4. Реакция, цвета, скорость и яркость будут сохранены в клавиатуру." : "Выберите профиль 1–4. В нём включится встроенный эффект; его цвета и скорость сохранятся." : "Выберите профиль 1–4. Его подсветка и указанные назначения будут заменены."}</p>
    {!connected && <p className="write-disconnected"><Usb size={16}/>Подключите KD3B rev.2 по USB. Содержимое профилей появится автоматически.</p>}
    <div className="slot-choices">
      {[1,2,3,4].map(slot=>{
        const entry=slots.find(item=>item.slot===slot);
        const stored=entry?.data?.config;
        return <button key={slot} className="slot-choice" disabled={!connected || busy || !entry?.data || !!entry.error} onClick={()=>onWrite(slot)}>
          <span className="slot-heading"><strong>Профиль {slot}</strong>{device.active===slot && <small><Check size={12}/>Активен</small>}</span>
          {stored && !stored.firmware ? <span className="slot-thumbnail" aria-hidden="true">{layout.map((key,index)=><i key={index} style={{left:`${key.x/18.5*100}%`,top:`${key.y/6.4*100}%`,width:`${key.width/18.5*100}%`,background:hex(stored.keys[index].color)}}/>)}</span> : <span className="slot-unavailable" aria-hidden="true"><HardDrive size={27}/></span>}
          <span className="slot-current">{!connected ? "USB не подключён" : entry?.error ? "Не удалось прочитать" : !entry?.data ? "Чтение…" : stored ? `Подсветка: ${names.get(slot) ?? (stored.firmware ? firmwareModes.find(item=>item.mode===stored.firmware!.mode)?.name ?? "встроенная" : "пользовательская")}` : "Заводской эффект"}</span>
          <span className="slot-action">Записать сюда<ArrowRight size={14}/></span>
        </button>;
      })}
    </div>
    {connected && <details className="memory-tools"><summary>Управление профилями клавиатуры</summary>{slots.map(entry=><div key={entry.slot}><span>Профиль {entry.slot}</span><button className="quiet small" disabled={busy || !entry.data?.config} onClick={()=>onOpen(entry.slot)}>Скопировать в библиотеку</button><button className="quiet small" disabled={busy || !entry.data || device.active===entry.slot} onClick={()=>onActivate(entry.slot)}>Включить</button></div>)}</details>}
  </dialog>;
}

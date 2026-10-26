import type { Dispatch, SetStateAction } from "react";
import { useEffect, useState } from "react";
import type { GradientDirection } from "../../model/profile";
import { editKeys, frameAt, gradient, hex, rgb } from "../../model/profile";
import type { Layer, Profile } from "../../model/types";
import { isStaticProfile } from "./library";

export function useProfileEditor({
  current,
  isPreset,
  active,
  tab,
  writeOpen,
  setProfiles,
}: {
  current: Profile | undefined;
  isPreset: boolean;
  active: string;
  tab: string;
  writeOpen: boolean;
  setProfiles: Dispatch<SetStateAction<Profile[]>>;
}) {
  const animates = !!current && !current.firmware && !isStaticProfile(current);
  const [selected, setSelected] = useState<number[]>([35, 51, 52, 53]),
    [layer, setLayer] = useState<Layer>("base");
  const [frame, setFrame] = useState(0),
    [playing, setPlaying] = useState(true),
    [painting, setPainting] = useState(false),
    [time, setTime] = useState(0),
    [gradientFrom, setGradientFrom] = useState("#00ffff"),
    [gradientDirection, setGradientDirection] =
      useState<GradientDirection>("right"),
    [gradientTo, setGradientTo] = useState("#ff5194");
  const [undo, setUndo] = useState<Profile[]>([]),
    [redo, setRedo] = useState<Profile[]>([]);
  useEffect(() => {
    if (
      !playing ||
      !current ||
      writeOpen ||
      !animates ||
      !["overview", "lighting", "frames"].includes(tab)
    )
      return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPlaying(false);
      return;
    }
    const start = performance.now();
    const timer = setInterval(() => setTime(performance.now() - start), 60);
    return () => clearInterval(timer);
  }, [playing, active, tab, animates, writeOpen]);
  useEffect(() => {
    if (
      current &&
      playing &&
      animates &&
      ["overview", "lighting", "frames"].includes(tab)
    )
      setFrame(frameAt(current, time));
  }, [time, playing, current, tab, animates]);
  useEffect(() => {
    setFrame(0);
    setGradientFrom(hex(current?.keys[0]?.color ?? [0, 255, 255]));
    setUndo([]);
    setRedo([]);
  }, [active]);

  function update(next: Profile) {
    if (!current || isPreset) return;
    setUndo((history) => [...history.slice(-29), current]);
    setRedo([]);
    setProfiles((items) => items.map((p) => (p.id === active ? next : p)));
  }
  function selectKey(index: number, multiple: boolean) {
    if (current && tab === "frames" && painting) {
      setPlaying(false);
      update({
        ...current,
        frames: current.frames.map((f, i) =>
          i === frame
            ? {
                ...f,
                keys: f.keys.includes(index)
                  ? f.keys.filter((k) => k !== index)
                  : [...f.keys, index],
              }
            : f,
        ),
      });
      return;
    }
    if (current) setGradientFrom(hex(current.keys[index].color));
    setSelected((items) =>
      multiple
        ? items.includes(index)
          ? items.filter((i) => i !== index)
          : [...items, index]
        : [index],
    );
  }
  function history(back: boolean) {
    if (!current || isPreset) return;
    const list = back ? undo : redo;
    const next = list.at(-1);
    if (!next) return;
    if (back) {
      setUndo(undo.slice(0, -1));
      setRedo([...redo, current]);
    } else {
      setRedo(redo.slice(0, -1));
      setUndo([...undo, current]);
    }
    setProfiles((items) => items.map((p) => (p.id === active ? next : p)));
  }
  const patch = (value: Parameters<typeof editKeys>[2]) => {
    if (current && selected.length) update(editKeys(current, selected, value));
  };
  const gradientDisabled =
    !current ||
    isPreset ||
    selected.length < 2 ||
    selected.some((index) => current.keys[index].effect === "cycle");
  function changeGradient(
    from: string,
    to: string,
    direction: GradientDirection,
  ) {
    setGradientFrom(from);
    setGradientTo(to);
    setGradientDirection(direction);
    if (current && !gradientDisabled)
      update(gradient(current, selected, rgb(from), rgb(to), direction));
  }
  const changeFrame = (index: number) => {
    setPlaying(false);
    setFrame(index);
  };

  return {
    selected,
    setSelected,
    layer,
    setLayer,
    frame,
    changeFrame,
    playing,
    setPlaying,
    painting,
    setPainting,
    time,
    undo,
    redo,
    update,
    selectKey,
    history,
    patch,
    gradientFrom,
    setGradientFrom,
    gradientTo,
    gradientDirection,
    gradientDisabled,
    changeGradient,
    animates,
  };
}

export type ProfileEditorState = ReturnType<typeof useProfileEditor>;

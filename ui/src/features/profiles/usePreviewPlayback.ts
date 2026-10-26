import { useEffect, useState } from "react";

export function usePreviewPlayback() {
  const [playing, setPlaying] = useState(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    function changed() {
      if (motion.matches) setPlaying(false);
    }
    motion.addEventListener("change", changed);
    return () => motion.removeEventListener("change", changed);
  }, []);
  // Reduced motion controls autoplay, but an explicit Play must still work.
  return [playing, setPlaying] as const;
}

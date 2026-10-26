import { writeFileSync } from "node:fs";
import { layout } from "../ui/src/model/keyboard.ts";
import { presetCatalog } from "../ui/src/features/profiles/catalog.ts";
writeFileSync(
  new URL("../resources/presets.json", import.meta.url),
  JSON.stringify(presetCatalog(), null, 2) + "\n",
);
writeFileSync(
  new URL("../resources/key-positions.json", import.meta.url),
  JSON.stringify(layout.map((k) => [k.x + k.width / 2, k.y + 0.5])) + "\n",
);

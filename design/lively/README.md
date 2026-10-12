# "Lively & Light" mockups

Review boards for the redesign described in `docs/redesign-prompt.md`, built in
DesignCraft (desktop layout app) from a generated command script.

- `boards/` — the 14 boards (screen on the left, design rationale with
  numbered principle callouts on the right), exported from DesignCraft.
- `build/` — the generator: `screens.py` (boards), `dc.py` (tiny DesignCraft
  script emitter), `crops.py` (focal crops of the photos), `build.sh`.

The DesignCraft source file, full-resolution Unsplash originals and the font
files are not committed (size). To rebuild, recreate a working folder with
`photos/` (originals, ids in `frontend/assets/images/CREDITS.md`),
`Document Fonts/` (Plus Jakarta Sans 400/600/700/800 + MaterialCommunityIcons
from `frontend/node_modules`) and `_mci.json` (the MaterialCommunityIcons
glyph map), copy `build/` into it, and run `bash build/build.sh`.

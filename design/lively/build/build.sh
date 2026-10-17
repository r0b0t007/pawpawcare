#!/usr/bin/env bash
# Rebuild the PawPawCare "Lively & Light" mockups in DesignCraft.
# Usage: copy this build/ folder into a working folder that holds photos/,
# "Document Fonts/" and _mci.json (see design/lively/README.md), then run
# `bash build/build.sh` from that working folder. Outputs land next to build/.
set -euo pipefail
cd "$(dirname "$0")/.."
CLI="${DESIGNCRAFT_CLI:-/c/Program Files/DesignCraft/designcraft-cli.exe}"
DOC=pawpawcare-lively.designcraft

python -I build/crops.py >/dev/null
# Phase 1: empty document saved beside "Document Fonts/" so Plus Jakarta Sans
# and the Material Design Icons font load when it is reopened.
printf '%s\n' 'file.new {"width":880,"height":940,"pages":14,"facingPages":false,"margins":0,"title":"PawPawCare - Lively & Light"}' \
  "file.saveAs {\"path\":\"$DOC\"}" > build/_phase1.txt
"$CLI" script build/_phase1.txt >/dev/null
# Phase 2: draw every board.
python -I build/screens.py build/_phase2.txt
"$CLI" script build/_phase2.txt --in "$DOC" --keep-going > build/_phase2.log
grep -c '"error"' build/_phase2.log && grep -B1 -A2 '"error"' build/_phase2.log | head -40 || true
# Exports: PNG per board at 2x, plus one PDF.
rm -rf exports/boards && mkdir -p exports/boards
"$CLI" run --in "$DOC" --scale 2 --all-pages exports/boards
"$CLI" run --in "$DOC" --cmd "file.exportPdf={\"path\":\"exports/pawpawcare-lively.pdf\"}"

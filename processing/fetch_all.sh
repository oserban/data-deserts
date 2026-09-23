#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3}"
RUN_BUILD=false
FORCE_FETCH=false
LIVING_PLANET_INPUT=""
MICS_INPUT="$SCRIPT_DIR/data/raw/MICS_Datasets.zip"
GRDC_INPUT="$SCRIPT_DIR/data/raw/grdc"
SKIPPED_LIST=""
WITH_CROP_ALLOCATION=false
WITH_HYDRO_COMPARISONS=false
CROP_ALLOCATION_BLOCKED=false

usage() {
  printf '%s\n' \
    "Usage: processing/fetch_all.sh [options]" \
    "" \
    "Fetch or parse every normalized dataset in pipeline order." \
    "" \
    "Options:" \
    "  --build                     Run processing/build_data.py after all fetches" \
    "  --crop-allocation           Include the strict harvested-area allocation workflow" \
    "                              Missing reviewed evidence defers this stage; other errors stop the pipeline" \
    "  --hydro-comparisons         Fetch and compute the three approved hydro map comparisons" \
    "  --force                     Fetch/parse even when today's output already exists" \
    "  --living-planet PATH        Agreement-protected Living Planet ZIP/CSV" \
    "  --mics PATH                 MICS archive (default: processing/data/raw/MICS_Datasets.zip)" \
    "  --grdc PATH                 GRDC ZIP/folder (default: processing/data/raw/grdc)" \
    "  --skip NAME                 Skip a dataset; repeatable" \
    "                              Names: biotime living_planet predicts dhs mics gbif lsms lsms_isa grdc crop_allocation hydro_comparisons" \
    "  -h, --help                  Show this help" \
    "" \
    "By default, datasets whose normalized output was modified today are skipped." \
    "PYTHON_BIN can select a Python executable, for example .venv/bin/python."
}

while (($#)); do
  case "$1" in
    --build) RUN_BUILD=true; shift ;;
    --crop-allocation) WITH_CROP_ALLOCATION=true; shift ;;
    --hydro-comparisons) WITH_HYDRO_COMPARISONS=true; shift ;;
    --force) FORCE_FETCH=true; shift ;;
    --living-planet)
      [[ $# -ge 2 ]] || { printf 'Missing value for --living-planet\n' >&2; exit 2; }
      LIVING_PLANET_INPUT="$2"; shift 2 ;;
    --mics)
      [[ $# -ge 2 ]] || { printf 'Missing value for --mics\n' >&2; exit 2; }
      MICS_INPUT="$2"; shift 2 ;;
    --grdc)
      [[ $# -ge 2 ]] || { printf 'Missing value for --grdc\n' >&2; exit 2; }
      GRDC_INPUT="$2"; shift 2 ;;
    --skip)
      [[ $# -ge 2 ]] || { printf 'Missing value for --skip\n' >&2; exit 2; }
      case "$2" in
        biotime|living_planet|predicts|dhs|mics|gbif|lsms|lsms_isa|grdc|crop_allocation|hydro_comparisons) SKIPPED_LIST="$SKIPPED_LIST $2" ;;
        *) printf 'Unknown dataset for --skip: %s\n' "$2" >&2; exit 2 ;;
      esac
      shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -z "$LIVING_PLANET_INPUT" ]]; then
  shopt -s nullglob
  living_planet_candidates=("$SCRIPT_DIR"/data/raw/LivingPlanetIndexDatabase_*.zip)
  shopt -u nullglob
  if ((${#living_planet_candidates[@]})); then
    LIVING_PLANET_INPUT="${living_planet_candidates[${#living_planet_candidates[@]}-1]}"
  fi
fi

run_fetch() {
  local name="$1"
  local output="$2"
  local script="$3"
  shift 3
  if ! fetch_needed "$name" "$output"; then
    return
  fi
  printf '\nFetching %s\n' "$name"
  "$PYTHON_BIN" "$script" "$@"
}

fetch_needed() {
  local name="$1"
  local output="$2"
  if is_skipped "$name"; then
    printf '\nSkipping %s (--skip)\n' "$name"
    return 1
  fi
  if [[ "$FORCE_FETCH" != true && -f "$output" ]]; then
    local output_date
    output_date="$(date -r "$output" +%Y-%m-%d)"
    if [[ "$output_date" == "$(date +%Y-%m-%d)" ]]; then
      printf '\nSkipping %s (output already updated today: %s)\n' "$name" "$output"
      return 1
    fi
  fi
  return 0
}

is_skipped() {
  local requested="$1" skipped
  for skipped in $SKIPPED_LIST; do
    [[ "$skipped" == "$requested" ]] && return 0
  done
  return 1
}

cd "$PROJECT_ROOT"
run_fetch biotime "$SCRIPT_DIR/data/biotime.json" "$SCRIPT_DIR/fetch_biotime.py"

if fetch_needed living_planet "$SCRIPT_DIR/data/living_planet.json"; then
  if [[ -z "$LIVING_PLANET_INPUT" || ! -f "$LIVING_PLANET_INPUT" ]]; then
    printf 'Living Planet input not found. Pass --living-planet PATH or --skip living_planet.\n' >&2
    exit 2
  fi
  printf '\nFetching living_planet\n'
  "$PYTHON_BIN" "$SCRIPT_DIR/fetch_living_planet.py" --input "$LIVING_PLANET_INPUT"
fi

run_fetch predicts "$SCRIPT_DIR/data/predicts.json" "$SCRIPT_DIR/fetch_predicts.py"
run_fetch dhs "$SCRIPT_DIR/data/dhs.json" "$SCRIPT_DIR/fetch_dhs.py"

if fetch_needed mics "$SCRIPT_DIR/data/mics.json"; then
  if [[ ! -f "$MICS_INPUT" ]]; then
    printf 'MICS input not found: %s. Pass --mics PATH or --skip mics.\n' "$MICS_INPUT" >&2
    exit 2
  fi
  printf '\nFetching mics\n'
  "$PYTHON_BIN" "$SCRIPT_DIR/fetch_mics.py" --input "$MICS_INPUT"
fi

run_fetch gbif "$SCRIPT_DIR/data/gbif.json" "$SCRIPT_DIR/fetch_gbif.py"
run_fetch lsms "$SCRIPT_DIR/data/lsms.json" "$SCRIPT_DIR/fetch_lsms.py"
run_fetch lsms_isa "$SCRIPT_DIR/data/lsms_isa.json" "$SCRIPT_DIR/fetch_lsms_isa.py"
run_fetch grdc "$SCRIPT_DIR/data/grdc.json" "$SCRIPT_DIR/fetch_grdc.py" --input "$GRDC_INPUT"

if [[ "$WITH_CROP_ALLOCATION" == true ]] && fetch_needed crop_allocation "$SCRIPT_DIR/data/crop_allocation_report.json"; then
  printf '\nFetching crop_allocation\n'
  if "$PYTHON_BIN" "$SCRIPT_DIR/fetch_crop_allocation.py"; then
    :
  else
    crop_status=$?
    # Exit 3 means missing reviewed inputs, never a failed scientific/data assertion.
    if [[ "$crop_status" -ne 3 ]]; then
      exit "$crop_status"
    fi
    CROP_ALLOCATION_BLOCKED=true
    printf '\nDeferring crop_allocation: verified evidence inputs are not ready. Continuing the remaining pipeline.\n'
  fi
fi

if [[ "$WITH_HYDRO_COMPARISONS" == true ]]; then
  run_fetch hydro_comparisons "$SCRIPT_DIR/data/hydro_comparisons/hydro_report.json" "$SCRIPT_DIR/fetch_hydro_comparisons.py"
fi

if [[ "$RUN_BUILD" == true ]]; then
  printf '\nBuilding application data\n'
  "$PYTHON_BIN" "$SCRIPT_DIR/build_data.py"
fi

if [[ "$CROP_ALLOCATION_BLOCKED" == true ]]; then
  printf '\nPipeline complete with crop_allocation blocked; no new agriculture scores were published.\n'
else
  printf '\nPipeline complete.\n'
fi

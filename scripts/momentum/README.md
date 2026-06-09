# Momentum Scripts

This folder contains the three momentum source scripts:

- `KR_Momentum_Map.py`
- `KR_Z_Daily.py`
- `movement_analysis.py`

Run the pipeline from the project root:

```bash
python scripts/momentum/run_momentum_update.py
```

The canonical output directory is `output/momentum`:

- `momentum_map.png`
- `z_daily.png`
- `movement.png`
- `analysis.json`

The runner sets these environment variables for the source scripts:

- `EAST_PROJECT_ROOT`
- `MOMENTUM_OUTPUT_DIR`
- `MOMENTUM_DISABLE_SUPABASE_UPLOAD=1`
- `MOMENTUM_DISABLE_TELEGRAM=1`
- `MOMENTUM_DISABLE_GITHUB_ACTIONS=1`
- `MOMENTUM_DISABLE_AI=1`

If the legacy scripts still write dated filenames, the runner will copy the latest matching file into the canonical filename above.

Telegram and AI calls are disabled by default. To enable Telegram later, set `MOMENTUM_ENABLE_TELEGRAM=1` and provide `TELEGRAM_BOT_TOKEN`.

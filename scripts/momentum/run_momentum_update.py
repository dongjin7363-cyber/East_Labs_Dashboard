from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "output" / "momentum"
DEFAULT_PUBLIC_DIR = PROJECT_ROOT / "public" / "momentum" / "latest"
LEGACY_OUTPUT_DIR = Path.home() / "Desktop" / "Python_Global"
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5")
ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
MAX_PROMPT_CHARS = 22_000
PUBLIC_OUTPUT_FILES = (
    "momentum_map.png",
    "z_daily.png",
    "movement.png",
    "analysis.json",
)


@dataclass(frozen=True)
class MomentumStep:
    name: str
    script_names: tuple[str, ...]
    canonical_output: str | None
    legacy_patterns: tuple[str, ...]


STEPS: tuple[MomentumStep, ...] = (
    MomentumStep(
        name="momentum_map",
        script_names=("KR_Momentum_Map.py", "momentum_map.py"),
        canonical_output="momentum_map.png",
        legacy_patterns=("KR_Momentum_Map_v2_*.png",),
    ),
    MomentumStep(
        name="z_daily",
        script_names=("KR_Z_Daily.py", "z_daily.py"),
        canonical_output="z_daily.png",
        legacy_patterns=("KR_Sector_ZScore_*.png",),
    ),
    MomentumStep(
        name="movement",
        script_names=("movement_analysis.py", "movement.py"),
        canonical_output="movement.png",
        legacy_patterns=("KR_Movement_*.png",),
    ),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the EAST momentum report pipeline.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Directory for canonical momentum outputs.",
    )
    parser.add_argument(
        "--skip-missing",
        action="store_true",
        help="Skip steps whose source script has not been placed yet.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the planned steps without running the source scripts.",
    )
    return parser.parse_args()


def find_script(step: MomentumStep) -> Path | None:
    for script_name in step.script_names:
        candidate = SCRIPT_DIR / script_name
        if candidate.exists():
            return candidate
    return None


def build_env(output_dir: Path) -> dict[str, str]:
    env = os.environ.copy()
    env.update(
        {
            "EAST_PROJECT_ROOT": str(PROJECT_ROOT),
            "MOMENTUM_OUTPUT_DIR": str(output_dir),
            "MOMENTUM_DISABLE_SUPABASE_UPLOAD": "1",
            "MOMENTUM_DISABLE_TELEGRAM": "1",
            "MOMENTUM_DISABLE_GITHUB_ACTIONS": "1",
            "MOMENTUM_DISABLE_AI": "1",
        }
    )
    return env


def latest_file(search_dir: Path, patterns: tuple[str, ...]) -> Path | None:
    matches: list[Path] = []
    for pattern in patterns:
        matches.extend(search_dir.glob(pattern))
    if not matches:
        return None
    return max(matches, key=lambda path: path.stat().st_mtime)


def promote_output(step: MomentumStep, output_dir: Path) -> Path | None:
    if step.canonical_output is None:
        return None

    canonical_path = output_dir / step.canonical_output
    source = latest_file(output_dir, step.legacy_patterns)
    if source is None and LEGACY_OUTPUT_DIR.exists():
        source = latest_file(LEGACY_OUTPUT_DIR, step.legacy_patterns)

    if source is None:
        return None

    if source.resolve() == canonical_path.resolve():
        return canonical_path

    if canonical_path.exists():
        canonical_path.unlink()

    shutil.copyfile(source, canonical_path)
    print(f"[alias] {source} -> {canonical_path}")
    return canonical_path


def truncate_text(value: str, max_chars: int = 8_000) -> str:
    if len(value) <= max_chars:
        return value
    return value[:max_chars] + "\n...[truncated]"


def latest_momentum_csv(output_dir: Path) -> Path | None:
    return latest_file(output_dir, ("KR_Momentum_Map_v2_*.csv",))


def load_momentum_rows(csv_path: Path | None, limit: int = 20) -> list[dict[str, str]]:
    if csv_path is None or not csv_path.exists():
        return []

    import csv

    rows: list[dict[str, str]] = []
    with csv_path.open(newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)
        for row in reader:
            rows.append({key: str(value) for key, value in row.items() if key})

    def score(row: dict[str, str]) -> float:
        try:
            return float(row.get("MomentumScore", "0"))
        except ValueError:
            return 0.0

    eligible_rows = [
        row for row in rows
        if row.get("Eligible", "").lower() in {"true", "1", "yes"}
    ]
    ranked_rows = sorted(eligible_rows or rows, key=score, reverse=True)

    keep_columns = (
        "Rank",
        "Sector",
        "ETFName",
        "Code",
        "RS_20(%p)",
        "RS_60(%p)",
        "RS_120(%p)",
        "Acceleration(bps/day)",
        "TrendQuality",
        "Quadrant",
        "MomentumScore",
        "Eligible",
    )
    return [
        {column: row.get(column, "") for column in keep_columns}
        for row in ranked_rows[:limit]
    ]


def extract_movement_summary(movement_stdout: str | None) -> str:
    if not movement_stdout:
        return ""

    lines = [line.rstrip() for line in movement_stdout.splitlines()]
    summary_start = 0
    for index, line in enumerate(lines):
        if "무브먼트 분석" in line:
            summary_start = index
            break

    ignored_prefixes = (
        "어제:",
        "비교 섹터:",
        "차트 저장:",
        "분석 중",
        "텔레그램 ",
        "전송 완료",
        "API 오류:",
    )
    summary_lines = [
        line for line in lines[summary_start:]
        if line and not line.startswith(ignored_prefixes)
    ]
    return "\n".join(summary_lines).strip()


def fallback_analysis(movement_summary: str) -> dict[str, str]:
    analysis_text = movement_summary.strip()
    if not analysis_text:
        analysis_text = "Claude analysis is unavailable. Momentum outputs were generated, but no movement summary text was captured."

    return {"analysis_text": analysis_text}


def build_claude_prompt(
    momentum_rows: list[dict[str, str]],
    z_daily_stdout: str,
    movement_summary: str,
    momentum_csv_path: Path | None,
) -> str:
    payload = {
        "momentum_csv": str(momentum_csv_path) if momentum_csv_path else "",
        "momentum_top_rows": momentum_rows,
        "z_daily_log": truncate_text(z_daily_stdout, 6_000),
        "movement_summary_text": truncate_text(movement_summary, 8_000),
    }
    input_json = json.dumps(payload, ensure_ascii=False, indent=2)

    today_label = datetime.now().strftime("%Y-%m-%d")
    prompt = f"""EAST 프로젝트의 섹터 모멘텀 결과를 한국어 텔레그램 리서치 메시지로 요약하세요.

아래 입력은 다음 자료에서 구성되었습니다.
- output/momentum/KR_Momentum_Map_v2_YYYYMMDD.csv의 상위 모멘텀 행
- z_daily 실행 로그
- movement_analysis.py가 출력한 movement summary text

반드시 아래 형식의 일반 텍스트만 반환하세요. JSON, Markdown 코드블록, 제목 외 설명, 리포트 문단은 금지합니다.

필수 출력 형식:
[{today_label}] 모멘텀 분석

🔴 중요 변화
- 항목
- 항목

🟢 강세 / 개선
- 항목
- 항목

🟠 둔화 / 주의
- 항목
- 항목

💡 핵심 해석
- 한줄 요약

작성 규칙:
- 절대 리포트 형식 금지.
- 절대 장문 문단 금지.
- 각 섹션은 최대 3개 bullet만 작성.
- 전체는 빈 줄 포함 12줄 이내.
- 텔레그램 리서치 메시지 스타일.
- 투자자가 5초 안에 읽을 수 있는 길이.
- 모든 내용은 bullet 중심으로 작성.
- bullet 하나는 30자 안팎의 짧은 구문으로 작성.
- 수치가 입력에 있을 때만 수치를 언급.
- 판단 근거가 부족한 섹션도 생략하지 말고 짧게 작성.
- 마지막 줄은 반드시 "💡 핵심 해석" 아래 bullet 1개로 끝냅니다.

입력 데이터:
{input_json}
"""
    return truncate_text(prompt, MAX_PROMPT_CHARS)


def request_claude(prompt: str, api_key: str) -> str:
    body = json.dumps(
        {
            "model": ANTHROPIC_MODEL,
            "max_tokens": 700,
            "messages": [{"role": "user", "content": prompt}],
        },
        ensure_ascii=False,
    ).encode("utf-8")
    request = urllib.request.Request(
        ANTHROPIC_API_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
            "x-api-key": api_key,
        },
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=45) as response:
        response_payload = json.loads(response.read().decode("utf-8"))

    content = response_payload.get("content", [])
    if not content or not isinstance(content, list):
        raise ValueError("Claude response did not include content")

    first_content = content[0]
    if not isinstance(first_content, Mapping):
        raise ValueError("Claude response content was not an object")

    text = first_content.get("text")
    if not isinstance(text, str) or not text.strip():
        raise ValueError("Claude response content did not include text")
    return text


def normalize_claude_text(response_text: str) -> str:
    text = response_text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    try:
        parsed = json.loads(text)
        if isinstance(parsed, Mapping):
            parsed_text = parsed.get("analysis_text")
            if isinstance(parsed_text, str):
                text = parsed_text.strip()
    except json.JSONDecodeError:
        pass

    lines = [line.rstrip() for line in text.splitlines()]
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    return "\n".join(lines).strip()


def generate_claude_analysis(
    output_dir: Path,
    step_stdout: Mapping[str, str],
    movement_stdout: str | None,
) -> dict[str, str]:
    movement_summary = extract_movement_summary(movement_stdout)
    fallback = fallback_analysis(movement_summary)
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        return fallback

    momentum_csv_path = latest_momentum_csv(output_dir)
    prompt = build_claude_prompt(
        momentum_rows=load_momentum_rows(momentum_csv_path),
        z_daily_stdout=step_stdout.get("z_daily", ""),
        movement_summary=movement_summary,
        momentum_csv_path=momentum_csv_path,
    )

    try:
        response_text = request_claude(prompt, api_key)
        analysis_text = normalize_claude_text(response_text)
        if not analysis_text:
            raise ValueError("Claude analysis was empty")

        return {"analysis_text": analysis_text}
    except (OSError, urllib.error.URLError, ValueError, json.JSONDecodeError) as error:
        print(f"[analysis:fallback] Claude analysis unavailable: {error}", file=sys.stderr)
        return fallback


def write_analysis_json(output_dir: Path, analysis: Mapping[str, str]) -> Path:
    path = output_dir / "analysis.json"

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "analysis_text": str(analysis.get("analysis_text", "")).strip(),
    }
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return path


def publish_latest_outputs(
    output_dir: Path,
    public_dir: Path = DEFAULT_PUBLIC_DIR,
) -> list[Path]:
    public_dir.mkdir(parents=True, exist_ok=True)

    copied_paths: list[Path] = []
    for filename in PUBLIC_OUTPUT_FILES:
        source = output_dir / filename
        if not source.exists():
            raise FileNotFoundError(f"Cannot publish missing momentum output: {source}")

        destination = public_dir / filename
        shutil.copy2(source, destination)
        copied_paths.append(destination)
        print(f"[publish] {source} -> {destination}")

    print(f"[publish] copied {len(copied_paths)} files to {public_dir}")
    return copied_paths


def run_step(script_path: Path, output_dir: Path) -> subprocess.CompletedProcess[str]:
    command = [
        sys.executable,
        str(script_path),
        "--output-dir",
        str(output_dir),
    ]
    return subprocess.run(
        command,
        cwd=PROJECT_ROOT,
        env=build_env(output_dir),
        text=True,
        capture_output=True,
        check=True,
    )


def main() -> int:
    args = parse_args()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Momentum output directory: {output_dir}")

    movement_stdout: str | None = None
    step_stdout: dict[str, str] = {}
    for step in STEPS:
        script_path = find_script(step)
        expected_names = ", ".join(step.script_names)

        if script_path is None:
            message = f"[missing] {step.name}: place one of {expected_names} in {SCRIPT_DIR}"
            if args.skip_missing:
                print(message)
                continue
            raise FileNotFoundError(message)

        print(f"[run] {step.name}: {script_path.name}")
        if args.dry_run:
            continue

        completed = run_step(script_path, output_dir)
        step_stdout[step.name] = completed.stdout or ""
        if completed.stdout:
            print(completed.stdout, end="")
        if completed.stderr:
            print(completed.stderr, end="", file=sys.stderr)
        if step.name == "movement":
            movement_stdout = completed.stdout

        promoted = promote_output(step, output_dir)
        if promoted is None:
            raise FileNotFoundError(
                f"{step.name} completed but {step.canonical_output} was not found"
            )
        print(f"[output] {promoted}")

    if not args.dry_run:
        analysis = generate_claude_analysis(output_dir, step_stdout, movement_stdout)
        analysis_path = write_analysis_json(output_dir, analysis)
        print(f"[output] {analysis_path}")
        publish_latest_outputs(output_dir)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

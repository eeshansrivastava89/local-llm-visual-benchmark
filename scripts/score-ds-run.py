#!/usr/bin/env python3
"""Score a data-science benchmark run against the canonical oracle.

Usage:
    python scripts/score-ds-run.py <run-directory> [--oracle <oracle.json>]

If --oracle is not provided, uses the committed reference oracle at
scripts/oracle/ab-test-analysis-oracle.json.

Outputs a Layer 1 deterministic scorecard as JSON to stdout.
"""

import json
import math
import os
import re
import sys
from pathlib import Path

ORACLE_REF = Path(__file__).parent / "oracle" / "ab-test-analysis-oracle.json"

# --- Check helpers ---

def check_summary_exists(run_dir: Path) -> dict:
    path = run_dir / "summary.json"
    if not path.is_file():
        return {"pass": False, "detail": "summary.json not found"}
    try:
        data = json.loads(path.read_text("utf8"))
        return {"pass": True, "detail": f"parsed {len(json.dumps(data))} bytes", "data": data}
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        return {"pass": False, "detail": f"parse error: {e}"}


def check_required_fields(summary: dict) -> dict:
    required = ["status", "recommended_variant", "raw_stats"]
    raw_stats_required = ["p_value", "cohens_d", "mean_a", "mean_b",
                           "completion_rate_a", "completion_rate_b",
                           "srm_p_value"]
    missing = []
    for field in required:
        if field not in summary:
            missing.append(field)
    if "raw_stats" in summary:
        for field in raw_stats_required:
            if field not in summary.get("raw_stats", {}):
                missing.append(f"raw_stats.{field}")
    if missing:
        return {"pass": False, "detail": f"missing: {', '.join(missing)}"}
    return {"pass": True, "detail": "all required fields present"}


def check_status_matches(summary: dict, oracle: dict) -> dict:
    actual = summary.get("status")
    expected = oracle.get("status")
    match = actual == expected
    return {"pass": match, "detail": f"got '{actual}', expected '{expected}'"}


def check_recommended_variant(summary: dict, oracle: dict) -> dict:
    actual = summary.get("recommended_variant")
    expected = oracle.get("recommended_variant")
    match = actual == expected
    return {"pass": match, "detail": f"got '{actual}', expected '{expected}'"}


def check_p_value(summary: dict, oracle: dict) -> dict:
    tolerance = oracle.get("tolerance", {}).get("p_value", 0.05)
    actual = summary.get("raw_stats", {}).get("p_value")
    expected = oracle.get("raw_stats", {}).get("p_value")
    if actual is None:
        return {"pass": False, "detail": "p_value missing from run"}
    within = abs(actual - expected) <= tolerance
    return {"pass": within, "detail": f"got {actual:.6f}, oracle {expected:.6f}, tolerance ±{tolerance}"}


def check_cohens_d(summary: dict, oracle: dict) -> dict:
    tolerance = oracle.get("tolerance", {}).get("cohens_d", 0.1)
    actual = summary.get("raw_stats", {}).get("cohens_d")
    expected = oracle.get("raw_stats", {}).get("cohens_d")
    if actual is None:
        return {"pass": False, "detail": "cohens_d missing from run"}
    within = abs(actual - expected) <= tolerance
    return {"pass": within, "detail": f"got {actual:.4f}, oracle {expected:.4f}, tolerance ±{tolerance}"}


def check_supabase_access(run_dir: Path) -> dict:
    """Check notebook for actual Supabase API calls vs hardcoded data."""
    notebook_path = run_dir / "analysis.ipynb"
    if not notebook_path.is_file():
        return {"pass": False, "detail": "analysis.ipynb not found"}
    try:
        nb = json.loads(notebook_path.read_text("utf8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return {"pass": False, "detail": "notebook parse error"}

    source = ""
    for cell in nb.get("cells", []):
        if cell.get("cell_type") == "code":
            source += "".join(cell.get("source", [])) + "\n"

    has_api_call = bool(re.search(r"requests\.(get|post)\s*\(", source))
    has_supabase_url = bool(re.search(r"SUPABASE_URL|supabase.*rest", source, re.IGNORECASE))
    has_apikey = bool(re.search(r"apikey|api_key|ANON_KEY", source, re.IGNORECASE))

    if has_api_call and has_supabase_url:
        return {"pass": True, "detail": "found Supabase API calls with credentials"}
    if has_api_call and has_apikey:
        return {"pass": True, "detail": "found API calls with key header"}

    # Fallback: check for pandas read from URL
    has_url_read = bool(re.search(r"pd\.read_json\s*\(\s*['\"]https?://", source))
    if has_url_read:
        return {"pass": True, "detail": "found pd.read_json from URL"}

    return {"pass": False, "detail": "no Supabase API calls detected in notebook"}


def check_hypothesis_tests(run_dir: Path) -> dict:
    """Check notebook for key scipy.stats calls."""
    notebook_path = run_dir / "analysis.ipynb"
    if not notebook_path.is_file():
        return {"pass": False, "detail": "analysis.ipynb not found"}
    try:
        nb = json.loads(notebook_path.read_text("utf8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return {"pass": False, "detail": "notebook parse error"}

    source = ""
    for cell in nb.get("cells", []):
        if cell.get("cell_type") == "code":
            source += "".join(cell.get("source", [])) + "\n"

    has_ttest = bool(re.search(r"ttest_ind|ttest_rel|ttest_1samp", source))
    has_chi2 = bool(re.search(r"chi2|chisquare|chi2_contingency", source))

    found = []
    if has_ttest:
        found.append("t-test")
    if has_chi2:
        found.append("chi-square")

    if has_ttest and has_chi2:
        return {"pass": True, "detail": f"found: {', '.join(found)}"}
    if has_ttest:
        return {"pass": False, "detail": f"found t-test but missing chi-square"}
    return {"pass": False, "detail": "no t-test or chi-square calls found"}


def check_charts_exist(run_dir: Path) -> dict:
    charts = ["chart-distribution.png", "chart-treatment-effect.png", "chart-completion-rates.png"]
    found = [c for c in charts if (run_dir / c).is_file()]
    if len(found) == 3:
        return {"pass": True, "detail": "all 3 chart files present"}
    missing = [c for c in charts if c not in found]
    return {"pass": False, "detail": f"found {len(found)}/3, missing: {', '.join(missing)}"}


def check_srm_test(run_dir: Path) -> dict:
    """Check notebook for SRM / sample ratio mismatch test."""
    notebook_path = run_dir / "analysis.ipynb"
    if not notebook_path.is_file():
        return {"pass": False, "detail": "analysis.ipynb not found"}
    try:
        nb = json.loads(notebook_path.read_text("utf8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return {"pass": False, "detail": "notebook parse error"}

    source = ""
    for cell in nb.get("cells", []):
        if cell.get("cell_type") == "code":
            source += "".join(cell.get("source", [])) + "\n"

    has_srm = bool(re.search(r"SRM|sample.ratio|mismatch|chi2_contingency.*sample", source, re.IGNORECASE))
    if has_srm:
        return {"pass": True, "detail": "SRM check found in notebook"}
    return {"pass": False, "detail": "no SRM check detected"}


# --- Score computation ---

CHECKS = [
    ("summary_exists",       "summary.json exists and parses",         5),
    ("required_fields",      "summary.json has required fields",       10),
    ("status_matches",       "status matches oracle",                 10),
    ("p_value",              "p_value within tolerance",                10),
    ("cohens_d",             "cohens_d within tolerance",              10),
    ("supabase_access",      "Data accessed from real Supabase",      15),
    ("hypothesis_tests",     "Key hypothesis tests present",           10),
    ("charts_exist",         "3 chart files exist",                    10),
    ("srm_test",            "SRM test performed",                      5),
    ("recommended_variant",  "recommended_variant matches oracle",    15),
]


def score_run(run_dir: Path, oracle: dict) -> dict:
    summary_result = check_summary_exists(run_dir)
    summary = summary_result.get("data", {})

    results = {}
    points = 0
    total = 0

    for check_id, label, max_pts in CHECKS:
        total += max_pts
        if check_id == "summary_exists":
            r = summary_result
        elif check_id == "required_fields":
            r = check_required_fields(summary)
        elif check_id == "status_matches":
            r = check_status_matches(summary, oracle)
        elif check_id == "recommended_variant":
            r = check_recommended_variant(summary, oracle)
        elif check_id == "p_value":
            r = check_p_value(summary, oracle)
        elif check_id == "cohens_d":
            r = check_cohens_d(summary, oracle)
        elif check_id == "supabase_access":
            r = check_supabase_access(run_dir)
        elif check_id == "hypothesis_tests":
            r = check_hypothesis_tests(run_dir)
        elif check_id == "charts_exist":
            r = check_charts_exist(run_dir)
        elif check_id == "srm_test":
            r = check_srm_test(run_dir)
        else:
            r = {"pass": False, "detail": "unknown check"}

        earned = max_pts if r["pass"] else 0
        points += earned
        results[check_id] = {
            "label": label,
            "max": max_pts,
            "earned": earned,
            "pass": r["pass"],
            "detail": r.get("detail", ""),
        }

    return {
        "layer": 1,
        "total": total,
        "earned": points,
        "pct": round(points / total * 100, 1) if total > 0 else 0,
        "checks": results,
    }


def load_oracle(path: Path) -> dict:
    if not path.is_file():
        print(f"Error: oracle file not found: {path}", file=sys.stderr)
        sys.exit(1)
    return json.loads(path.read_text("utf8"))


def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <run-directory> [--oracle <oracle.json>]", file=sys.stderr)
        sys.exit(1)

    run_dir = Path(sys.argv[1])
    if not run_dir.is_dir():
        print(f"Error: {run_dir} is not a directory", file=sys.stderr)
        sys.exit(1)

    oracle_path = ORACLE_REF
    for i, arg in enumerate(sys.argv[2:], 2):
        if arg == "--oracle" and i + 1 < len(sys.argv):
            oracle_path = Path(sys.argv[i + 1])

    oracle = load_oracle(oracle_path)
    scorecard = score_run(run_dir, oracle)
    print(json.dumps(scorecard, indent=2))


if __name__ == "__main__":
    main()
#!/usr/bin/env python3
"""Check CCA off-site recovery evidence from an independent scheduled host.

Run hourly with a read-only rclone identity for the staging backup folder.
Exit 1 indicates a missed deadline or unreadable/invalid evidence. Configure
the scheduler to alert on failure and send its own heartbeat.
"""

import argparse
from datetime import datetime, time, timedelta, timezone
import json
import re
import subprocess
import sys

UTC = timezone.utc
ARCHIVE = re.compile(r"cca-staging-\d{4}-\d{2}-\d{2}-\d{6}-[a-f0-9]{8}\.cms")


def rclone(*args):
    return subprocess.run(
        ["rclone", *args, "--contimeout", "10s", "--timeout", "30s", "--retries", "1"],
        check=True, capture_output=True, text=True, timeout=60,
    ).stdout


def expected_run(now, hour, weekday=None):
    candidate = datetime.combine(now.date(), time(hour), UTC)
    if weekday is not None:
        candidate -= timedelta(days=(candidate.weekday() - weekday) % 7)
    if now < candidate + timedelta(hours=2):
        candidate -= timedelta(days=1 if weekday is None else 7)
    return candidate


def check(remote, action, required_since, now, names):
    pattern = re.compile(
        rf"cca-staging-{action}-success-\d{{4}}-\d{{2}}-\d{{2}}-\d{{6}}-[a-f0-9]{{8}}\.json"
    )
    marker = max((name for name in names if pattern.fullmatch(name)), default=None)
    if marker is None:
        raise ValueError("no off-site success marker")
    started = datetime.strptime(marker.split("-success-")[1][:-14], "%Y-%m-%d-%H%M%S").replace(tzinfo=UTC)
    evidence = json.loads(rclone("cat", f"{remote}/{marker}"))
    if not isinstance(evidence, dict):
        raise ValueError("invalid marker")
    archive = evidence.get("archive")
    checksum = evidence.get("sha256")
    if (
        evidence.get("action") != action.title() or evidence.get("storage") != "offsite"
        or not isinstance(archive, str) or not ARCHIVE.fullmatch(archive)
        or archive not in names or not isinstance(checksum, str)
        or not re.fullmatch(r"[a-f0-9]{64}", checksum)
    ):
        raise ValueError("invalid evidence or missing archive")
    stamp = evidence.get("completedUtc")
    if not isinstance(stamp, str):
        raise ValueError("missing completion timestamp")
    completed = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    if completed.utcoffset() is None or not required_since <= started <= completed <= now:
        raise ValueError(f"no valid success since {required_since.isoformat()}")
    return completed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", help="rclone remote:CRNETWORK-CCA-Staging-Backups")
    args = parser.parse_args()
    remote = args.destination
    if not re.fullmatch(r"[A-Za-z0-9_-]+:CRNETWORK-CCA-Staging-Backups", remote):
        parser.error("use the dedicated staging backup folder")
    now = datetime.now(UTC)
    try:
        names = set(rclone("lsf", remote, "--files-only", "--max-depth", "1").splitlines())
    except (OSError, subprocess.SubprocessError):
        print("ALERT: could not list off-site staging backups", file=sys.stderr)
        return 1

    failed = False
    # 08:00 daily and 10:00 Saturday in Lagos, plus a two-hour grace period.
    for action, hour, weekday in (("backup", 7, None), ("restore", 9, 5)):
        try:
            completed = check(remote, action, expected_run(now, hour, weekday), now, names)
            print(f"OK: off-site staging {action} verified at {completed.isoformat()}")
        except ValueError as exc:
            print(f"ALERT: staging {action}: {exc}", file=sys.stderr)
            failed = True
        except (OSError, subprocess.SubprocessError):
            print(f"ALERT: could not read staging {action} evidence", file=sys.stderr)
            failed = True
    return int(failed)


if __name__ == "__main__":
    sys.exit(main())

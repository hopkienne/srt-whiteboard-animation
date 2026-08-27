"""Keep Chinese CLI output usable on Windows consoles with legacy code pages."""

from __future__ import annotations

import sys


def configure_utf8_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is None:
            continue
        try:
            reconfigure(encoding="utf-8", errors="replace")
        except (OSError, ValueError):
            # Some embedded or already-closed streams cannot be reconfigured.
            pass

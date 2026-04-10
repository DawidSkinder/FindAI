#!/usr/bin/env python3

from __future__ import annotations

import argparse
import io
import json
import multiprocessing
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


@dataclass
class FileMeasurement:
    path: str
    group: str
    png_bytes: int
    webp_bytes: int

    @property
    def saved_bytes(self) -> int:
        return self.png_bytes - self.webp_bytes

    @property
    def savings_ratio(self) -> float:
        if self.png_bytes <= 0:
            return 0.0
        return self.saved_bytes / self.png_bytes


@dataclass
class EncoderConfig:
    quality: int
    method: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Measure lossless WebP savings for an existing PNG tile pyramid without replacing assets.",
    )
    parser.add_argument(
        "source",
        nargs="?",
        default="generated/design-v2-smaller-pyramid",
        help="Directory containing the PNG pyramid to analyze.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Optional max number of PNG files to process. 0 means all files.",
    )
    parser.add_argument(
        "--json-out",
        default="",
        help="Optional path for a JSON report.",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=0,
        help="Number of parallel worker processes. 0 uses a small automatic default.",
    )
    parser.add_argument(
        "--webp-quality",
        type=int,
        default=100,
        help="Lossless WebP quality setting to use for measurement.",
    )
    parser.add_argument(
        "--webp-method",
        type=int,
        default=6,
        help="Lossless WebP encoder method to use for measurement.",
    )
    return parser.parse_args()


def format_bytes(num_bytes: int) -> str:
    units = ["B", "KiB", "MiB", "GiB"]
    value = float(num_bytes)

    for unit in units:
        if value < 1024 or unit == units[-1]:
            return f"{value:.2f} {unit}"
        value /= 1024

    return f"{num_bytes} B"


def measure_file(path: Path, root: Path, encoder: EncoderConfig) -> FileMeasurement:
    relative_path = path.relative_to(root).as_posix()
    group = path.parent.name if path.parent != root else "root"
    png_bytes = path.stat().st_size

    with Image.open(path) as image:
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA")

        buffer = io.BytesIO()
        image.save(
            buffer,
            format="WEBP",
            lossless=True,
            quality=encoder.quality,
            method=encoder.method,
        )
        webp_bytes = buffer.tell()

    return FileMeasurement(
        path=relative_path,
        group=group,
        png_bytes=png_bytes,
        webp_bytes=webp_bytes,
    )


def measure_file_task(task: tuple[str, str, int, int]) -> FileMeasurement:
    path_string, root_string, quality, method = task
    return measure_file(Path(path_string), Path(root_string), EncoderConfig(quality=quality, method=method))


def aggregate_group(measurements: list[FileMeasurement], group: str) -> dict[str, object]:
    items = [item for item in measurements if item.group == group]
    png_bytes = sum(item.png_bytes for item in items)
    webp_bytes = sum(item.webp_bytes for item in items)
    saved_bytes = png_bytes - webp_bytes
    savings_ratio = (saved_bytes / png_bytes) if png_bytes else 0.0

    return {
        "group": group,
        "count": len(items),
        "png_bytes": png_bytes,
        "png_human": format_bytes(png_bytes),
        "webp_bytes": webp_bytes,
        "webp_human": format_bytes(webp_bytes),
        "saved_bytes": saved_bytes,
        "saved_human": format_bytes(saved_bytes),
        "savings_ratio": savings_ratio,
        "savings_percent": round(savings_ratio * 100, 2),
    }


def build_report(measurements: list[FileMeasurement], source: Path, encoder: EncoderConfig) -> dict[str, object]:
    png_bytes = sum(item.png_bytes for item in measurements)
    webp_bytes = sum(item.webp_bytes for item in measurements)
    saved_bytes = png_bytes - webp_bytes
    savings_ratio = (saved_bytes / png_bytes) if png_bytes else 0.0
    groups = sorted({item.group for item in measurements})

    largest_savers = sorted(
        measurements,
        key=lambda item: item.saved_bytes,
        reverse=True,
    )[:20]

    worst_results = sorted(
        measurements,
        key=lambda item: item.savings_ratio,
    )[:20]

    return {
        "source": str(source),
        "count": len(measurements),
        "encoder": {
            "format": "webp-lossless",
            "quality": encoder.quality,
            "method": encoder.method,
        },
        "summary": {
            "png_bytes": png_bytes,
            "png_human": format_bytes(png_bytes),
            "webp_bytes": webp_bytes,
            "webp_human": format_bytes(webp_bytes),
            "saved_bytes": saved_bytes,
            "saved_human": format_bytes(saved_bytes),
            "savings_ratio": savings_ratio,
            "savings_percent": round(savings_ratio * 100, 2),
        },
        "groups": [aggregate_group(measurements, group) for group in groups],
        "largest_savers": [
            {
                "path": item.path,
                "png_bytes": item.png_bytes,
                "webp_bytes": item.webp_bytes,
                "saved_bytes": item.saved_bytes,
                "savings_percent": round(item.savings_ratio * 100, 2),
            }
            for item in largest_savers
        ],
        "worst_results": [
            {
                "path": item.path,
                "png_bytes": item.png_bytes,
                "webp_bytes": item.webp_bytes,
                "saved_bytes": item.saved_bytes,
                "savings_percent": round(item.savings_ratio * 100, 2),
            }
            for item in worst_results
        ],
    }


def print_report(report: dict[str, object]) -> None:
    summary = report["summary"]
    groups = report["groups"]
    encoder = report["encoder"]

    print("Lossless WebP Savings Report")
    print(f"Source: {report['source']}")
    print(f"Files: {report['count']}")
    print(f"Encoder: quality={encoder['quality']}, method={encoder['method']}")
    print(
        "Total: "
        f"{summary['png_human']} PNG -> {summary['webp_human']} WebP "
        f"({summary['saved_human']} saved, {summary['savings_percent']}%)"
    )
    print("")
    print("By group:")

    for group in groups:
        print(
            f"- {group['group']}: {group['count']} files, "
            f"{group['png_human']} -> {group['webp_human']} "
            f"({group['saved_human']} saved, {group['savings_percent']}%)"
        )


def main() -> int:
    args = parse_args()
    source = Path(args.source).resolve()
    encoder = EncoderConfig(
        quality=max(0, min(100, args.webp_quality)),
        method=max(0, min(6, args.webp_method)),
    )

    if not source.exists():
      raise SystemExit(f"Source directory does not exist: {source}")

    png_files = sorted(source.rglob("*.png"))

    if args.limit > 0:
        png_files = png_files[: args.limit]

    worker_count = args.workers

    if worker_count <= 0:
        worker_count = min(8, max(1, (multiprocessing.cpu_count() or 1) // 2))

    tasks = [(str(path), str(source), encoder.quality, encoder.method) for path in png_files]

    if worker_count == 1:
        measurements = [measure_file(Path(path_string), source, encoder) for path_string, _, _, _ in tasks]
    else:
        with multiprocessing.Pool(processes=worker_count) as pool:
            measurements = pool.map(measure_file_task, tasks)

    report = build_report(measurements, source, encoder)
    print_report(report)

    if args.json_out:
        output_path = Path(args.json_out)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

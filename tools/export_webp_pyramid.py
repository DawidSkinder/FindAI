#!/usr/bin/env python3

from __future__ import annotations

import argparse
import multiprocessing
from pathlib import Path

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export lossless WebP companions for an existing PNG tile pyramid without deleting PNG files.",
    )
    parser.add_argument(
        "source",
        nargs="?",
        default="generated/design-v2-smaller-pyramid",
        help="Directory containing overview.png and level-* PNG tiles.",
    )
    parser.add_argument(
        "--webp-quality",
        type=int,
        default=100,
        help="Lossless WebP quality setting.",
    )
    parser.add_argument(
        "--webp-method",
        type=int,
        default=4,
        help="Lossless WebP encoder method.",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip WebP files that already exist.",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=0,
        help="Number of parallel worker processes. 0 uses a small automatic default.",
    )
    return parser.parse_args()


def export_image(source_path: Path, target_path: Path, quality: int, method: int) -> tuple[int, int]:
    png_bytes = source_path.stat().st_size

    with Image.open(source_path) as image:
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA")

        target_path.parent.mkdir(parents=True, exist_ok=True)
        image.save(
            target_path,
            format="WEBP",
            lossless=True,
            quality=quality,
            method=method,
        )

    return png_bytes, target_path.stat().st_size


def export_image_task(task: tuple[str, str, int, int]) -> tuple[str, int, int]:
    source_path_string, target_path_string, quality, method = task
    source_path = Path(source_path_string)
    target_path = Path(target_path_string)
    png_bytes, webp_bytes = export_image(source_path, target_path, quality, method)
    return source_path_string, png_bytes, webp_bytes


def iter_png_files(source_root: Path) -> list[Path]:
    png_files = []

    overview_path = source_root / "overview.png"
    if overview_path.exists():
        png_files.append(overview_path)

    for level_dir in sorted(path for path in source_root.iterdir() if path.is_dir() and path.name.startswith("level-")):
        png_files.extend(sorted(level_dir.glob("*.png")))

    return png_files


def main() -> int:
    args = parse_args()
    source_root = Path(args.source).resolve()

    if not source_root.exists():
        raise SystemExit(f"Source directory does not exist: {source_root}")

    png_files = iter_png_files(source_root)
    quality = max(0, min(100, args.webp_quality))
    method = max(0, min(6, args.webp_method))
    worker_count = args.workers

    if worker_count <= 0:
        worker_count = min(8, max(1, (multiprocessing.cpu_count() or 1) // 2))

    converted_count = 0
    skipped_count = 0
    png_total = 0
    webp_total = 0
    tasks: list[tuple[str, str, int, int]] = []

    for png_path in png_files:
        webp_path = png_path.with_suffix(".webp")

        if args.skip_existing and webp_path.exists():
            skipped_count += 1
            continue

        tasks.append((str(png_path), str(webp_path), quality, method))

    def record_result(source_path_string: str, png_bytes: int, webp_bytes: int) -> None:
        nonlocal converted_count, png_total, webp_total
        source_path = Path(source_path_string)
        png_total += png_bytes
        webp_total += webp_bytes
        converted_count += 1
        print(f"converted {source_path.relative_to(source_root).as_posix()} -> {source_path.with_suffix('.webp').name}")

    if worker_count == 1:
        for task in tasks:
            source_path_string, png_bytes, webp_bytes = export_image_task(task)
            record_result(source_path_string, png_bytes, webp_bytes)
    else:
        with multiprocessing.Pool(processes=worker_count) as pool:
            for source_path_string, png_bytes, webp_bytes in pool.imap_unordered(export_image_task, tasks):
                record_result(source_path_string, png_bytes, webp_bytes)

    saved_bytes = png_total - webp_total
    savings_percent = ((saved_bytes / png_total) * 100) if png_total else 0

    print("")
    print(f"Converted: {converted_count}")
    print(f"Skipped: {skipped_count}")
    print(f"PNG bytes processed: {png_total}")
    print(f"WebP bytes written: {webp_total}")
    print(f"Saved bytes: {saved_bytes}")
    print(f"Savings percent: {savings_percent:.2f}%")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

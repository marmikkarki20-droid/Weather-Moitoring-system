"""Command-line entry point for one or all WeatherGrid simulators."""

from __future__ import annotations

import argparse
import logging
import random
import signal
import sys
import threading
from pathlib import Path
from queue import Queue

from simulator.config import (
    DEFAULT_STATE_DIR,
    DEVICE_PROFILES,
    DeviceProfile,
    get_device_profile,
    get_mqtt_settings,
)
from simulator.device import SimulatedDevice

logger = logging.getLogger(__name__)


def _positive_int(value: str) -> int:
    parsed = int(value)
    if parsed < 1:
        raise argparse.ArgumentTypeError("must be at least 1")
    return parsed


def _positive_float(value: str) -> float:
    parsed = float(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be greater than 0")
    return parsed


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Publish simulated WeatherGrid MQTT telemetry")
    subparsers = parser.add_subparsers(dest="command", required=True)

    run = subparsers.add_parser("run", help="run one seeded device")
    run.add_argument("--device", required=True, choices=sorted(DEVICE_PROFILES))

    run_all = subparsers.add_parser("run-all", help="run all seeded devices independently")

    for command in (run, run_all):
        command.add_argument(
            "--messages",
            type=_positive_int,
            help="stop gracefully after this many messages per device",
        )
        command.add_argument(
            "--interval",
            type=_positive_float,
            help="override the configured publish interval in seconds",
        )
        command.add_argument(
            "--state-dir",
            type=Path,
            default=DEFAULT_STATE_DIR,
            help=f"sequence-state directory (default: {DEFAULT_STATE_DIR})",
        )
        command.add_argument("--seed", type=int, help="deterministic random seed")

    subparsers.add_parser("list", help="list configured devices")
    return parser


def _install_signal_handlers(stop_event: threading.Event) -> None:
    def request_stop(signum, frame) -> None:  # noqa: ANN001
        logger.info("shutdown_signal=%s action=graceful_stop", signum)
        stop_event.set()

    signal.signal(signal.SIGINT, request_stop)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, request_stop)


def _with_interval(profile: DeviceProfile, interval: float | None) -> DeviceProfile:
    if interval is None:
        return profile
    return profile.model_copy(update={"publishing_interval_seconds": interval})


def _run_one(args: argparse.Namespace, stop_event: threading.Event) -> None:
    profile = _with_interval(get_device_profile(args.device), args.interval)
    device = SimulatedDevice(
        profile,
        get_mqtt_settings(),
        args.state_dir,
        rng=random.Random(args.seed) if args.seed is not None else None,
    )
    device.run(max_messages=args.messages, stop_event=stop_event)


def _run_all(args: argparse.Namespace, stop_event: threading.Event) -> None:
    failures: Queue[BaseException] = Queue()

    def run_profile(profile: DeviceProfile, seed_offset: int) -> None:
        try:
            selected = _with_interval(profile, args.interval)
            rng = random.Random(args.seed + seed_offset) if args.seed is not None else None
            SimulatedDevice(selected, get_mqtt_settings(), args.state_dir, rng=rng).run(
                max_messages=args.messages,
                stop_event=stop_event,
            )
        except BaseException as exc:  # propagated to the main thread below
            failures.put(exc)
            stop_event.set()

    threads = [
        threading.Thread(
            target=run_profile,
            args=(profile, index),
            name=f"simulator-{profile.device_id}",
        )
        for index, profile in enumerate(DEVICE_PROFILES.values())
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    if not failures.empty():
        raise failures.get()


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)

    if args.command == "list":
        for profile in DEVICE_PROFILES.values():
            print(f"{profile.device_id}\t{profile.location_code}\t{profile.device_name}")
        return 0

    try:
        settings = get_mqtt_settings()
    except Exception:
        # Do not render settings validation internals: model input may have
        # originated in sensitive environment variables.
        print("Invalid simulator configuration; check MQTT environment values.", file=sys.stderr)
        return 2
    logging.basicConfig(
        level=getattr(logging, settings.log_level),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    stop_event = threading.Event()
    _install_signal_handlers(stop_event)

    try:
        if args.command == "run":
            _run_one(args, stop_event)
        else:
            _run_all(args, stop_event)
    except (InterruptedError, KeyboardInterrupt):
        stop_event.set()
        return 130
    except Exception:
        logger.exception("simulator_result=failed")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""
run_pipeline.py
---------------
SecureLedger — Master ML Pipeline Orchestrator

Runs all 7 pipeline steps in the correct order with beautiful terminal
output, per-step timing, error recovery, prerequisite checks, and a
full summary report at the end.

Usage examples:
  # Full pipeline
  python run_pipeline.py

  # Skip ingestion (data already in Neo4j)
  python run_pipeline.py --skip-ingest

  # Start from step 3 (embeddings already built)
  python run_pipeline.py --from-step 3

  # Skip multiple steps
  python run_pipeline.py --skip-ingest --skip-graph

  # Non-interactive mode (never prompt — always continue on error)
  python run_pipeline.py --no-interactive

  # Dry run — show what would run without executing anything
  python run_pipeline.py --dry-run
"""

from __future__ import annotations

import argparse
import importlib.util
import os
import subprocess
import sys
import time
import traceback
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import Callable

# ════════════════════════════════════════════════════════════════════════════════
# OPTIONAL RICH — degrades gracefully to plain ANSI if not installed
# ════════════════════════════════════════════════════════════════════════════════
try:
    from rich.console import Console
    from rich.panel   import Panel
    from rich.table   import Table
    from rich.text    import Text
    from rich         import box as rich_box
    _RICH = True
    console = Console()
except ImportError:
    _RICH   = False
    console = None   # type: ignore[assignment]

# ════════════════════════════════════════════════════════════════════════════════
# ANSI COLOUR FALLBACK
# Used when Rich is not installed — keeps output readable everywhere.
# ════════════════════════════════════════════════════════════════════════════════
class C:
    RESET  = "\033[0m"
    BOLD   = "\033[1m"
    DIM    = "\033[2m"
    RED    = "\033[91m"
    GREEN  = "\033[92m"
    YELLOW = "\033[93m"
    BLUE   = "\033[94m"
    PURPLE = "\033[95m"
    CYAN   = "\033[96m"
    WHITE  = "\033[97m"

    @staticmethod
    def strip_supported() -> bool:
        """Return True if the terminal supports ANSI codes."""
        return hasattr(sys.stdout, "isatty") and sys.stdout.isatty()


def _c(colour: str, text: str) -> str:
    """Wrap text in ANSI colour only when supported."""
    if C.strip_supported():
        return f"{colour}{text}{C.RESET}"
    return text


# ════════════════════════════════════════════════════════════════════════════════
# STEP STATUS ENUM
# ════════════════════════════════════════════════════════════════════════════════
class Status(Enum):
    PENDING  = "pending"
    SKIPPED  = "skipped"
    RUNNING  = "running"
    SUCCESS  = "success"
    FAILED   = "failed"
    ABORTED  = "aborted"    # step was not attempted because a prior step failed

STATUS_ICON = {
    Status.PENDING : "⏳",
    Status.SKIPPED : "⏭ ",
    Status.RUNNING : "⚙️ ",
    Status.SUCCESS : "✅",
    Status.FAILED  : "❌",
    Status.ABORTED : "🚫",
}

STATUS_COLOR = {
    Status.PENDING : C.DIM,
    Status.SKIPPED : C.CYAN,
    Status.RUNNING : C.YELLOW,
    Status.SUCCESS : C.GREEN,
    Status.FAILED  : C.RED,
    Status.ABORTED : C.DIM,
}


# ════════════════════════════════════════════════════════════════════════════════
# STEP DATACLASS
# ════════════════════════════════════════════════════════════════════════════════
@dataclass
class PipelineStep:
    number:      int
    name:        str
    description: str
    module_path: str          # e.g. "ml/gnnn.py" — used for display
    runner:      Callable     # callable that executes the step
    skip:        bool = False

    # Filled in during execution
    status:      Status             = field(default=Status.PENDING, init=False)
    elapsed:     float              = field(default=0.0,           init=False)
    error:       str | None         = field(default=None,          init=False)
    started_at:  datetime | None    = field(default=None,          init=False)
    finished_at: datetime | None    = field(default=None,          init=False)

    def elapsed_str(self) -> str:
        if self.elapsed < 60:
            return f"{self.elapsed:.1f}s"
        m, s = divmod(int(self.elapsed), 60)
        return f"{m}m {s}s"


# ════════════════════════════════════════════════════════════════════════════════
# PRETTY PRINTER
# Wraps both Rich and plain-ANSI printing so the rest of the code
# never has to check which is available.
# ════════════════════════════════════════════════════════════════════════════════
class Printer:

    # ── Banner ──────────────────────────────────────────────────────────────

    @staticmethod
    def banner() -> None:
        lines = [
            "",
            "  ███████╗███████╗ ██████╗██╗   ██╗██████╗ ███████╗",
            "  ██╔════╝██╔════╝██╔════╝██║   ██║██╔══██╗██╔════╝",
            "  ███████╗█████╗  ██║     ██║   ██║██████╔╝█████╗  ",
            "  ╚════██║██╔══╝  ██║     ██║   ██║██╔══██╗██╔══╝  ",
            "  ███████║███████╗╚██████╗╚██████╔╝██║  ██║███████╗",
            "  ╚══════╝╚══════╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝",
            "",
            "  ██╗     ███████╗██████╗  ██████╗ ███████╗██████╗ ",
            "  ██║     ██╔════╝██╔══██╗██╔════╝ ██╔════╝██╔══██╗",
            "  ██║     █████╗  ██║  ██║██║  ███╗█████╗  ██████╔╝",
            "  ██║     ██╔══╝  ██║  ██║██║   ██║██╔══╝  ██╔══██╗",
            "  ███████╗███████╗██████╔╝╚██████╔╝███████╗██║  ██║",
            "  ╚══════╝╚══════╝╚═════╝  ╚═════╝ ╚══════╝╚═╝  ╚═╝",
            "",
            "  AI-Powered Financial Fraud Detection Pipeline",
            f"  Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            "",
        ]
        if _RICH:
            console.print(
                Panel(
                    "\n".join(lines),
                    style="bold purple",
                    box=rich_box.DOUBLE_EDGE,
                )
            )
        else:
            border = "═" * 60
            print(_c(C.PURPLE, border))
            for line in lines:
                print(_c(C.PURPLE, line))
            print(_c(C.PURPLE, border))

    # ── Section header ───────────────────────────────────────────────────────

    @staticmethod
    def section(text: str) -> None:
        if _RICH:
            console.rule(f"[bold cyan]{text}[/bold cyan]")
        else:
            pad = (58 - len(text)) // 2
            print(f"\n{_c(C.CYAN, '─' * pad + ' ' + text + ' ' + '─' * pad)}\n")

    # ── Step start ───────────────────────────────────────────────────────────

    @staticmethod
    def step_start(step: PipelineStep) -> None:
        msg = (
            f"  {STATUS_ICON[Status.RUNNING]}  "
            f"Step {step.number}/7 — {step.name}"
        )
        if _RICH:
            console.print(f"\n[bold yellow]{msg}[/bold yellow]")
            console.print(f"  [dim]{step.description}[/dim]")
            console.print(f"  [dim]Module: {step.module_path}[/dim]\n")
        else:
            print(f"\n{_c(C.YELLOW, msg)}")
            print(f"  {_c(C.DIM, step.description)}")
            print(f"  {_c(C.DIM, 'Module: ' + step.module_path)}\n")

    # ── Step result ──────────────────────────────────────────────────────────

    @staticmethod
    def step_result(step: PipelineStep) -> None:
        icon  = STATUS_ICON[step.status]
        color = STATUS_COLOR[step.status]

        if step.status == Status.SUCCESS:
            msg = f"  {icon}  Step {step.number} — {step.name} completed in {step.elapsed_str()}"
            if _RICH:
                console.print(f"[bold green]{msg}[/bold green]")
            else:
                print(_c(C.GREEN, msg))

        elif step.status == Status.SKIPPED:
            msg = f"  {icon}  Step {step.number} — {step.name} skipped"
            if _RICH:
                console.print(f"[cyan]{msg}[/cyan]")
            else:
                print(_c(C.CYAN, msg))

        elif step.status == Status.FAILED:
            msg = f"  {icon}  Step {step.number} — {step.name} FAILED after {step.elapsed_str()}"
            if _RICH:
                console.print(f"[bold red]{msg}[/bold red]")
                if step.error:
                    console.print(Panel(step.error, title="Error", style="red"))
            else:
                print(_c(C.RED, msg))
                if step.error:
                    print(_c(C.RED, f"\n  Error:\n{step.error}"))

        elif step.status == Status.ABORTED:
            msg = f"  {icon}  Step {step.number} — {step.name} not attempted (pipeline aborted)"
            if _RICH:
                console.print(f"[dim]{msg}[/dim]")
            else:
                print(_c(C.DIM, msg))

    # ── Warning ──────────────────────────────────────────────────────────────

    @staticmethod
    def warn(text: str) -> None:
        if _RICH:
            console.print(f"  [yellow]⚠️  {text}[/yellow]")
        else:
            print(_c(C.YELLOW, f"  ⚠️  {text}"))

    # ── Error ────────────────────────────────────────────────────────────────

    @staticmethod
    def error(text: str) -> None:
        if _RICH:
            console.print(f"  [bold red]❌  {text}[/bold red]")
        else:
            print(_c(C.RED, f"  ❌  {text}"))

    # ── Info ─────────────────────────────────────────────────────────────────

    @staticmethod
    def info(text: str) -> None:
        if _RICH:
            console.print(f"  [blue]ℹ️   {text}[/blue]")
        else:
            print(_c(C.BLUE, f"  ℹ️   {text}"))

    # ── Success ──────────────────────────────────────────────────────────────

    @staticmethod
    def ok(text: str) -> None:
        if _RICH:
            console.print(f"  [green]✅  {text}[/green]")
        else:
            print(_c(C.GREEN, f"  ✅  {text}"))

    # ── Final summary table ───────────────────────────────────────────────────

    @staticmethod
    def summary(steps: list[PipelineStep], total_elapsed: float) -> None:
        Printer.section("Pipeline Summary")

        passed  = sum(1 for s in steps if s.status == Status.SUCCESS)
        skipped = sum(1 for s in steps if s.status == Status.SKIPPED)
        failed  = sum(1 for s in steps if s.status == Status.FAILED)
        aborted = sum(1 for s in steps if s.status == Status.ABORTED)

        total_m, total_s = divmod(int(total_elapsed), 60)
        total_str = f"{total_m}m {total_s}s" if total_m else f"{total_elapsed:.1f}s"

        if _RICH:
            table = Table(
                title=f"SecureLedger Pipeline — Total time: {total_str}",
                box=rich_box.ROUNDED,
                show_header=True,
                header_style="bold cyan",
            )
            table.add_column("#",           style="dim",   width=4)
            table.add_column("Step",        style="white", min_width=28)
            table.add_column("Status",      style="white", width=12)
            table.add_column("Duration",    style="white", width=12)
            table.add_column("Module",      style="dim",   min_width=24)

            for s in steps:
                icon     = STATUS_ICON[s.status]
                duration = s.elapsed_str() if s.elapsed > 0 else "—"

                status_styles = {
                    Status.SUCCESS: "[green]SUCCESS[/green]",
                    Status.FAILED:  "[red]FAILED[/red]",
                    Status.SKIPPED: "[cyan]SKIPPED[/cyan]",
                    Status.ABORTED: "[dim]ABORTED[/dim]",
                    Status.PENDING: "[dim]PENDING[/dim]",
                }
                table.add_row(
                    str(s.number),
                    f"{icon} {s.name}",
                    status_styles.get(s.status, s.status.value),
                    duration,
                    s.module_path,
                )

            console.print(table)

            # Overall result
            if failed == 0 and aborted == 0:
                console.print(Panel(
                    f"[bold green]🎉  All steps completed successfully![/bold green]\n"
                    f"[green]{passed} passed · {skipped} skipped · total time {total_str}[/green]",
                    style="green",
                ))
            else:
                console.print(Panel(
                    f"[bold red]Pipeline finished with errors[/bold red]\n"
                    f"[green]{passed} passed[/green] · "
                    f"[red]{failed} failed[/red] · "
                    f"[dim]{aborted} aborted · {skipped} skipped[/dim]\n"
                    f"Total time: {total_str}",
                    style="red",
                ))

        else:
            # ── Plain text summary ─────────────────────────────────────────
            border = "─" * 64
            print(f"\n{_c(C.CYAN, border)}")
            print(_c(C.BOLD, f"  Pipeline Summary — Total time: {total_str}"))
            print(_c(C.CYAN, border))

            for s in steps:
                icon     = STATUS_ICON[s.status]
                color    = STATUS_COLOR[s.status]
                duration = s.elapsed_str() if s.elapsed > 0 else "—"
                line     = f"  {icon}  [{s.number}] {s.name:<30}  {s.status.value:<8}  {duration:>8}  {s.module_path}"
                print(_c(color, line))

            print(_c(C.CYAN, border))

            if failed == 0 and aborted == 0:
                print(_c(C.GREEN, f"\n  🎉  All steps completed!  {passed} passed · {skipped} skipped · {total_str}\n"))
            else:
                print(_c(C.RED, f"\n  ⚠️   {passed} passed · {failed} failed · {aborted} aborted · {skipped} skipped · {total_str}\n"))


# ════════════════════════════════════════════════════════════════════════════════
# PREREQUISITE CHECKS
# Run before any pipeline step to catch obvious misconfigurations early.
# ════════════════════════════════════════════════════════════════════════════════

class PrerequisiteError(Exception):
    """Raised when a hard prerequisite is not met (pipeline cannot continue)."""


def check_python_version() -> None:
    """Require Python 3.9+."""
    major, minor = sys.version_info[:2]
    if (major, minor) < (3, 9):
        raise PrerequisiteError(
            f"Python 3.9+ required. Found {major}.{minor}. "
            "Please upgrade your Python interpreter."
        )
    Printer.ok(f"Python {major}.{minor} ✓")


def check_required_packages() -> list[str]:
    """
    Check that the heavy ML dependencies are importable.
    Returns a list of missing package names.
    """
    required = {
        "torch":          "torch",
        "torch_geometric":"torch_geometric",
        "neo4j":          "neo4j",
        "sklearn":        "scikit-learn",
        "numpy":          "numpy",
        "pandas":         "pandas",
        "tqdm":           "tqdm",
    }
    missing = []
    for import_name, pip_name in required.items():
        if importlib.util.find_spec(import_name) is None:
            missing.append(pip_name)
            Printer.warn(f"Package not found: {pip_name}  (pip install {pip_name})")
        else:
            Printer.ok(f"{pip_name} ✓")
    return missing


def check_data_file() -> bool:
    """
    Verify the HI-Small_Trans.csv dataset exists.
    Searches in ./data/ and the project root.
    """
    candidates = [
        Path("data/HI-Small_Trans.csv"),
        Path("HI-Small_Trans.csv"),
        Path("../data/HI-Small_Trans.csv"),
    ]
    for p in candidates:
        if p.exists():
            size_mb = p.stat().st_size / 1_048_576
            Printer.ok(f"Data file found: {p}  ({size_mb:.1f} MB) ✓")
            return True

    Printer.warn(
        "Data file not found. Looked in: "
        + ", ".join(str(p) for p in candidates)
        + "\n  Step 1 (ingest) will fail unless you provide the CSV."
    )
    return False


def check_ml_directory() -> None:
    """Create ml/ if it doesn't exist (needed for output artefacts)."""
    ml_dir = Path("ml")
    ml_dir.mkdir(exist_ok=True)
    Printer.ok("ml/ output directory ready ✓")


def check_neo4j(timeout: int = 5) -> bool:
    """
    Try to open a Neo4j driver and run a trivial query.
    Returns True if Neo4j is reachable.
    """
    try:
        from neo4j import GraphDatabase
        from neo4j.exceptions import ServiceUnavailable, AuthError

        driver = GraphDatabase.driver(
            "bolt://localhost:7687",
            auth=("neo4j", "secureledger123"),
            connection_timeout=timeout,
        )
        with driver.session() as session:
            session.run("RETURN 1").single()
        driver.close()
        Printer.ok("Neo4j reachable at bolt://localhost:7687 ✓")
        return True
    except Exception as exc:
        Printer.warn(
            f"Neo4j unreachable: {exc}\n"
            "  Make sure Neo4j is running before starting the pipeline."
        )
        return False


def check_intermediate_files(skip_ingest: bool, skip_graph: bool, skip_embeddings: bool) -> None:
    """
    Warn if expected intermediate files from previous steps are missing
    when their generating step is being skipped.
    """
    checks = [
        (skip_graph,      Path("ml/graph.pt"),       "ml/graph.pt",       "Step 2 (build_pyg_graph)"),
        (skip_embeddings, Path("ml/embeddings.npy"), "ml/embeddings.npy", "Step 3 (embeddings)"),
    ]
    for should_check, path, name, generator in checks:
        if should_check and not path.exists():
            Printer.warn(
                f"{name} not found but its generator ({generator}) is being skipped. "
                "Downstream steps may fail."
            )


def run_prerequisite_checks(args: argparse.Namespace) -> bool:
    """
    Run all prerequisite checks.
    Returns True if it is safe to proceed, False if hard errors were found.
    """
    Printer.section("Prerequisite Checks")
    all_ok = True

    try:
        check_python_version()
    except PrerequisiteError as exc:
        Printer.error(str(exc))
        return False

    missing_pkgs = check_required_packages()
    if missing_pkgs:
        Printer.error(
            f"Missing packages: {', '.join(missing_pkgs)}\n"
            f"  Run: pip install {' '.join(missing_pkgs)}"
        )
        all_ok = False

    check_ml_directory()

    data_ok = check_data_file()
    if not data_ok and not args.skip_ingest:
        # Only a hard error if we actually plan to run ingestion
        all_ok = False

    neo4j_ok = check_neo4j()
    if not neo4j_ok:
        all_ok = False

    check_intermediate_files(
        skip_ingest=args.skip_ingest,
        skip_graph=args.skip_graph,
        skip_embeddings=args.skip_embeddings,
    )

    return all_ok


# ════════════════════════════════════════════════════════════════════════════════
# STEP RUNNERS
# Each runner imports and calls the appropriate module function rather than
# spawning a subprocess — this keeps stdout in-process and makes tracebacks
# readable.
# ════════════════════════════════════════════════════════════════════════════════

def run_ingest() -> None:
    """Step 1 — Ingest CSV transactions into Neo4j."""
    from ingestion.ingest import run
    run()


def run_build_graph() -> None:
    """Step 2 — Build PyG graph object from Neo4j and save to ml/graph.pt."""
    # Import the module from its file path so we don't require it to be a
    # properly installed package.
    spec   = importlib.util.spec_from_file_location("build_pyg_graph", "ml/build_pyg_graph.py")
    module = importlib.util.module_from_spec(spec)       # type: ignore[arg-type]
    spec.loader.exec_module(module)                      # type: ignore[union-attr]

    # Convention: the script's top-level logic runs in main() or at module level.
    # If it exposes a main() or run() function, prefer that; otherwise the
    # exec_module call above already ran the top-level code.
    if hasattr(module, "main"):
        module.main()
    elif hasattr(module, "run"):
        module.run()
    # else: top-level code was executed by exec_module


def run_embeddings() -> None:
    """Step 3 — Train Node2Vec embeddings."""
    import torch
    from ml.embeddings import train_node2vec

    data = torch.load("ml/graph.pt", weights_only=False)
    train_node2vec(data)


def run_anomaly() -> None:
    """Step 4 — Compute Isolation Forest anomaly scores."""
    import torch
    from ml.anomaly import compute_anomaly_scores, write_scores_to_neo4j

    scores = compute_anomaly_scores(embeddings_path="ml/embeddings.npy")
    data   = torch.load("ml/graph.pt", weights_only=False)
    write_scores_to_neo4j(scores, data)


def run_propagation() -> None:
    """Step 5 — Propagate risk scores through the graph."""
    spec   = importlib.util.spec_from_file_location("propagation", "ml/propagation.py")
    module = importlib.util.module_from_spec(spec)       # type: ignore[arg-type]
    spec.loader.exec_module(module)                      # type: ignore[union-attr]

    if hasattr(module, "main"):
        module.main()
    elif hasattr(module, "run"):
        module.run()


def run_gnn() -> None:
    """Step 6 — Train GraphSAGE GNN and write fraud_prob to Neo4j."""
    spec   = importlib.util.spec_from_file_location("gnnn", "ml/gnnn.py")
    module = importlib.util.module_from_spec(spec)       # type: ignore[arg-type]
    spec.loader.exec_module(module)                      # type: ignore[union-attr]

    if hasattr(module, "main"):
        module.main()


def run_louvain() -> None:
    """Step 7 — Detect fraud rings via Louvain community detection."""
    spec   = importlib.util.spec_from_file_location("louvain", "ml/louvain.py")
    module = importlib.util.module_from_spec(spec)       # type: ignore[arg-type]
    spec.loader.exec_module(module)                      # type: ignore[union-attr]

    if hasattr(module, "main"):
        module.main()
    elif hasattr(module, "run"):
        module.run()


# ════════════════════════════════════════════════════════════════════════════════
# PIPELINE DEFINITION
# Single source of truth for step ordering, names, and runners.
# ════════════════════════════════════════════════════════════════════════════════

def build_pipeline(args: argparse.Namespace) -> list[PipelineStep]:
    """
    Build the ordered list of PipelineStep objects, applying skip flags
    and --from-step filtering from CLI args.
    """
    steps = [
        PipelineStep(
            number=1,
            name="Data Ingestion",
            description="Load HI-Small_Trans.csv and write transactions into Neo4j",
            module_path="ingestion/ingest.py",
            runner=run_ingest,
        ),
        PipelineStep(
            number=2,
            name="Build PyG Graph",
            description="Convert Neo4j graph into a PyTorch Geometric Data object",
            module_path="ml/build_pyg_graph.py",
            runner=run_build_graph,
        ),
        PipelineStep(
            number=3,
            name="Node2Vec Embeddings",
            description="Train Node2Vec random-walk embeddings on the graph",
            module_path="ml/embeddings.py",
            runner=run_embeddings,
        ),
        PipelineStep(
            number=4,
            name="Anomaly Scores",
            description="Fit Isolation Forest on embeddings and write scores to Neo4j",
            module_path="ml/anomaly.py",
            runner=run_anomaly,
        ),
        PipelineStep(
            number=5,
            name="Risk Propagation",
            description="Propagate risk scores through the transaction graph",
            module_path="ml/propagation.py",
            runner=run_propagation,
        ),
        PipelineStep(
            number=6,
            name="GNN Training",
            description="Train GraphSAGE + ensemble model, write fraud_prob to Neo4j",
            module_path="ml/gnnn.py",
            runner=run_gnn,
        ),
        PipelineStep(
            number=7,
            name="Fraud Ring Detection",
            description="Run Louvain community detection to identify fraud rings",
            module_path="ml/louvain.py",
            runner=run_louvain,
        ),
    ]

    # ── Apply explicit skip flags ──────────────────────────────────────────────
    skip_map = {
        1: args.skip_ingest,
        2: args.skip_graph,
        3: args.skip_embeddings,
    }
    for step in steps:
        if skip_map.get(step.number, False):
            step.skip = True

    # ── Apply --from-step  (skip everything before N) ─────────────────────────
    if args.from_step > 1:
        for step in steps:
            if step.number < args.from_step:
                step.skip = True

    # ── Apply --only-step  (run exactly one step) ─────────────────────────────
    if args.only_step is not None:
        for step in steps:
            if step.number != args.only_step:
                step.skip = True

    return steps


# ════════════════════════════════════════════════════════════════════════════════
# INTERACTIVE PROMPT
# ════════════════════════════════════════════════════════════════════════════════

def ask_continue(step: PipelineStep) -> bool:
    """
    Ask the user whether to continue after a step failure.
    Returns True = continue, False = abort.
    """
    if _RICH:
        console.print(
            f"\n[bold yellow]Step {step.number} ({step.name}) failed.[/bold yellow]\n"
            "[yellow]Do you want to continue with the remaining steps?[/yellow]\n"
            "[dim]  Type 'y' to continue, 'n' to stop, or 'r' to retry this step.[/dim]"
        )
    else:
        print(_c(C.YELLOW,
            f"\nStep {step.number} ({step.name}) failed.\n"
            "Continue with remaining steps? [y/n/r (retry)]: "
        ), end="")

    while True:
        try:
            answer = input("  → ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            return False

        if answer in ("y", "yes"):
            return True
        if answer in ("n", "no", "q", "quit"):
            return False
        if answer in ("r", "retry"):
            return None   # type: ignore[return-value]  — sentinel for retry

        print("  Please type 'y', 'n', or 'r'.")


# ════════════════════════════════════════════════════════════════════════════════
# CORE EXECUTOR
# ════════════════════════════════════════════════════════════════════════════════

def execute_step(step: PipelineStep, dry_run: bool) -> None:
    """
    Run a single step, measuring wall-clock time and capturing any exception.
    Sets step.status, step.elapsed, and step.error in-place.
    """
    step.status     = Status.RUNNING
    step.started_at = datetime.now()
    t0              = time.perf_counter()

    Printer.step_start(step)

    if dry_run:
        Printer.info(f"[DRY RUN] Would execute: {step.module_path}")
        time.sleep(0.2)      # simulate a tiny pause so output is readable
        step.status     = Status.SUCCESS
        step.elapsed    = time.perf_counter() - t0
        step.finished_at = datetime.now()
        Printer.step_result(step)
        return

    try:
        step.runner()
        step.status = Status.SUCCESS
    except KeyboardInterrupt:
        step.status = Status.FAILED
        step.error  = "Interrupted by user (Ctrl+C)"
        raise
    except Exception:
        step.status = Status.FAILED
        step.error  = traceback.format_exc()
    finally:
        step.elapsed     = time.perf_counter() - t0
        step.finished_at = datetime.now()

    Printer.step_result(step)


def run_pipeline(
    steps:          list[PipelineStep],
    interactive:    bool,
    dry_run:        bool,
) -> bool:
    """
    Execute all steps in order.

    Returns True if all non-skipped steps succeeded, False otherwise.
    """
    pipeline_ok = True

    for step in steps:

        # ── Skip ──────────────────────────────────────────────────────────────
        if step.skip:
            step.status = Status.SKIPPED
            Printer.step_result(step)
            continue

        # ── Execute with optional retry ───────────────────────────────────────
        max_attempts = 2 if interactive else 1

        for attempt in range(max_attempts):
            execute_step(step, dry_run)

            if step.status == Status.SUCCESS:
                break

            # Step failed — decide what to do
            if interactive and not dry_run:
                decision = ask_continue(step)

                if decision is None:
                    # Retry — reset status and loop
                    Printer.info(f"Retrying step {step.number}…")
                    step.status = Status.PENDING
                    step.error  = None
                    continue

                if decision:
                    # Continue to next step despite failure
                    pipeline_ok = False
                    break
                else:
                    # Abort pipeline
                    pipeline_ok = False
                    # Mark all remaining un-run steps as ABORTED
                    remaining = [
                        s for s in steps
                        if s.status in (Status.PENDING, Status.RUNNING)
                        and s.number > step.number
                        and not s.skip
                    ]
                    for s in remaining:
                        s.status = Status.ABORTED
                    return False
            else:
                # Non-interactive: log the failure and continue
                pipeline_ok = False
                Printer.warn(
                    f"Step {step.number} failed — continuing in non-interactive mode."
                )
                break

    return pipeline_ok


# ════════════════════════════════════════════════════════════════════════════════
# CLI
# ════════════════════════════════════════════════════════════════════════════════

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="run_pipeline",
        description=(
            "SecureLedger ML Pipeline Orchestrator\n"
            "Runs all 7 steps in order: ingest → graph → embeddings → \n"
            "anomaly → propagation → GNN → rings"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python run_pipeline.py                          # full pipeline
  python run_pipeline.py --skip-ingest            # skip CSV ingestion
  python run_pipeline.py --from-step 4            # start from anomaly scoring
  python run_pipeline.py --only-step 6            # run GNN only
  python run_pipeline.py --dry-run                # preview without executing
  python run_pipeline.py --no-interactive         # CI/CD mode — never prompt
        """,
    )

    skip_group = parser.add_argument_group("Skip flags")
    skip_group.add_argument(
        "--skip-ingest",
        action="store_true",
        help="Skip Step 1 (data ingestion — data already in Neo4j)",
    )
    skip_group.add_argument(
        "--skip-graph",
        action="store_true",
        help="Skip Step 2 (graph building — ml/graph.pt already exists)",
    )
    skip_group.add_argument(
        "--skip-embeddings",
        action="store_true",
        help="Skip Step 3 (Node2Vec — ml/embeddings.npy already exists)",
    )

    range_group = parser.add_argument_group("Range control")
    range_group.add_argument(
        "--from-step",
        type=int,
        default=1,
        metavar="N",
        choices=range(1, 8),
        help="Start pipeline from step N (1–7). Steps before N are skipped.",
    )
    range_group.add_argument(
        "--only-step",
        type=int,
        default=None,
        metavar="N",
        choices=range(1, 8),
        help="Run only step N and skip everything else.",
    )

    behaviour_group = parser.add_argument_group("Behaviour")
    behaviour_group.add_argument(
        "--no-interactive",
        action="store_true",
        help="Never prompt on failure — log error and continue (good for CI/CD).",
    )
    behaviour_group.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would run without actually executing any step.",
    )
    behaviour_group.add_argument(
        "--skip-checks",
        action="store_true",
        help="Skip prerequisite checks (faster start if you know env is ready).",
    )

    return parser


# ════════════════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ════════════════════════════════════════════════════════════════════════════════

def main() -> int:
    parser = build_parser()
    args   = parser.parse_args()

    # Ensure we're running from the project root
    project_root = Path(__file__).parent.resolve()
    os.chdir(project_root)
    sys.path.insert(0, str(project_root))

    Printer.banner()

    # ── Prerequisite checks ───────────────────────────────────────────────────
    if not args.skip_checks:
        prereqs_ok = run_prerequisite_checks(args)
        if not prereqs_ok and not args.dry_run:
            if not args.no_interactive:
                try:
                    answer = input(
                        _c(C.YELLOW,
                           "\n  ⚠️  Prerequisites failed. Continue anyway? [y/N]: ")
                    ).strip().lower()
                    if answer not in ("y", "yes"):
                        Printer.error("Pipeline aborted by user.")
                        return 1
                except (EOFError, KeyboardInterrupt):
                    return 1
            else:
                Printer.error("Prerequisites failed — aborting (non-interactive mode).")
                return 1
    else:
        Printer.info("Prerequisite checks skipped (--skip-checks).")

    # ── Build and display plan ────────────────────────────────────────────────
    steps = build_pipeline(args)

    Printer.section("Execution Plan")
    for step in steps:
        if step.skip:
            if _RICH:
                console.print(f"  [cyan]⏭   Step {step.number}: {step.name}[/cyan]  [dim](skipped)[/dim]")
            else:
                print(_c(C.CYAN, f"  ⏭   Step {step.number}: {step.name}  (skipped)"))
        else:
            if _RICH:
                console.print(f"  [white]▶   Step {step.number}: {step.name}[/white]  [dim]{step.module_path}[/dim]")
            else:
                print(f"  ▶   Step {step.number}: {step.name}  {_c(C.DIM, step.module_path)}")

    if args.dry_run:
        Printer.info("DRY RUN mode — no steps will be executed.")

    # ── Confirm before running ────────────────────────────────────────────────
    active_steps = [s for s in steps if not s.skip]
    if not args.no_interactive and not args.dry_run:
        try:
            Printer.info(
                f"{len(active_steps)} step(s) will run. Press Enter to start, Ctrl+C to cancel."
            )
            input()
        except KeyboardInterrupt:
            print("\nAborted.")
            return 1

    # ── Execute ───────────────────────────────────────────────────────────────
    Printer.section("Running Pipeline")
    pipeline_start = time.perf_counter()

    try:
        success = run_pipeline(
            steps=steps,
            interactive=not args.no_interactive,
            dry_run=args.dry_run,
        )
    except KeyboardInterrupt:
        Printer.error("\nPipeline interrupted by user (Ctrl+C).")
        success = False

    total_elapsed = time.perf_counter() - pipeline_start

    # ── Summary ───────────────────────────────────────────────────────────────
    Printer.summary(steps, total_elapsed)

    # ── Write machine-readable run report ─────────────────────────────────────
    _write_run_report(steps, total_elapsed, success)

    return 0 if success else 1


def _write_run_report(
    steps:         list[PipelineStep],
    total_elapsed: float,
    success:       bool,
) -> None:
    """
    Write a JSON run report to ml/pipeline_run_report.json so downstream
    tooling (e.g. the FastAPI health endpoint) can inspect the last run.
    """
    import json

    report = {
        "timestamp":     datetime.now().isoformat(),
        "success":       success,
        "total_elapsed": round(total_elapsed, 2),
        "steps": [
            {
                "number":      s.number,
                "name":        s.name,
                "status":      s.status.value,
                "elapsed":     round(s.elapsed, 2),
                "started_at":  s.started_at.isoformat()  if s.started_at  else None,
                "finished_at": s.finished_at.isoformat() if s.finished_at else None,
                "error":       s.error,
            }
            for s in steps
        ],
    }

    report_path = Path("ml/pipeline_run_report.json")
    try:
        report_path.parent.mkdir(exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2))
        Printer.info(f"Run report written → {report_path}")
    except OSError as exc:
        Printer.warn(f"Could not write run report: {exc}")


if __name__ == "__main__":
    sys.exit(main())
#!/usr/bin/env python3
"""生成轻量级项目目录树和各目录导航说明。"""

from __future__ import annotations

import argparse
import datetime as dt
import re
from pathlib import Path


EXCLUDED = {
    ".git",
    ".codex",
    ".clude",
    "__pycache__",
    "node_modules",
    ".next",
    # Build outputs and transient state: index source, not generated artifacts.
    "dist",
    "build",
    ".gradle",
    "coverage",
    "tmp",
    # Generated mod projects (gitignored): regenerate from a spec, never hand-edited.
    "out",
    # Temporary workspace (gitignored): acceptance artifacts and one-off scripts.
    "Temp",
}
CODE_EXTENSIONS = {".py", ".js", ".jsx", ".ts", ".tsx", ".java", ".cs", ".go", ".rs", ".sql", ".c", ".cpp", ".h"}


def visible_children(path: Path):
    return sorted(
        (item for item in path.iterdir() if item.name not in EXCLUDED and not item.name.startswith(".")),
        key=lambda item: (item.is_file(), item.name.lower()),
    )


def tree_lines(root: Path, relative: Path = Path("."), prefix: str = ""):
    current = root / relative
    children = visible_children(current)
    lines = []
    for index, item in enumerate(children):
        branch = "`-- " if index == len(children) - 1 else "|-- "
        lines.append(f"{prefix}{branch}{item.name}")
        if item.is_dir():
            child_prefix = prefix + ("    " if index == len(children) - 1 else "|   ")
            lines.extend(tree_lines(root, item.relative_to(root), child_prefix))
    return lines


def symbols(path: Path):
    if path.suffix.lower() not in CODE_EXTENSIONS:
        return []
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return []
    pattern = r"^\s*(?:async\s+)?(?:def|class|function|interface|enum|struct|public\s+(?:class|interface|static)|export\s+(?:default\s+)?)\s+([A-Za-z_]\w*)"
    return sorted(set(re.findall(pattern, text, flags=re.MULTILINE)))


def write_notes(root: Path, output: Path):
    directories = (
        p
        for p in root.rglob("*")
        if p.is_dir()
        # A directory is skipped when it or ANY ancestor is excluded (e.g. packages/x/node_modules/@types).
        and not (set(p.relative_to(root).parts) & EXCLUDED)
        and not any(part.startswith(".") for part in p.relative_to(root).parts)
        and p != output
        and output not in p.parents
    )
    for directory in sorted(directories, key=lambda p: p.as_posix().lower()):
        relative = directory.relative_to(root)
        note = output / f"{relative.as_posix().replace('/', '__')}.md"
        entries = []
        for child in visible_children(directory):
            rel = child.relative_to(root).as_posix()
            found = symbols(child) if child.is_file() else []
            suffix = f" - symbols: {', '.join(found)}" if found else ""
            entries.append(f"- `{rel}`{suffix}")
        note.write_text(
            "# 目录： " + relative.as_posix() + "\n\n"
            "用途：记录该目录的归属和导航入口。\n\n"
            "## 内容\n\n" + ("\n".join(entries) if entries else "- 没有可见文件。") + "\n",
            encoding="utf-8",
        )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("project_root", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    root = args.project_root.resolve()
    output = (args.output or root / "Tree").resolve()
    output.mkdir(parents=True, exist_ok=True)
    (output / "Tree.md").write_text(
        "# 项目目录树\n\n"
        f"更新时间: {dt.date.today().isoformat()}\n\n"
        "排除目录: " + ", ".join(sorted(EXCLUDED)) + "\n\n"
        "```text\n" + root.name + "/\n" + "\n".join(tree_lines(root)) + "\n```\n",
        encoding="utf-8",
    )
    write_notes(root, output)


if __name__ == "__main__":
    main()

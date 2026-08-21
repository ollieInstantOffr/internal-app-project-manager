"use client";

import { useMemo, useState } from "react";
import { fileBadge } from "./highlight";

export type TreeNode = {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  fileCount?: number;
  children?: TreeNode[];
};

export function FileTree({
  tree,
  activePath,
  flagged,
  filter,
  onOpen,
}: {
  tree: TreeNode[];
  activePath: string | null;
  flagged: Set<string>;
  filter: string;
  onOpen: (path: string) => void;
}) {
  // Everything on the path to the open file starts expanded.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (activePath) {
      const parts = activePath.split("/");
      for (let i = 1; i < parts.length; i++) initial.add(parts.slice(0, i).join("/"));
    }
    tree.filter((n) => n.type === "dir").slice(0, 1).forEach((n) => initial.add(n.path));
    return initial;
  });

  const needle = filter.trim().toLowerCase();

  // Filtering flattens to matching files — a tree of near-misses helps nobody.
  const matches = useMemo(() => {
    if (!needle) return null;
    const out: TreeNode[] = [];
    const walk = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.type === "file" && node.path.toLowerCase().includes(needle)) out.push(node);
        if (node.children) walk(node.children);
        if (out.length > 200) return;
      }
    };
    walk(tree);
    return out;
  }, [tree, needle]);

  if (matches) {
    return (
      <div className="tree">
        {matches.length === 0 && <div className="tree-empty">No file matches “{filter}”.</div>}
        {matches.map((node) => (
          <FileRow
            key={node.path}
            node={node}
            depth={0}
            active={node.path === activePath}
            flagged={flagged.has(node.path)}
            showPath
            onOpen={onOpen}
          />
        ))}
      </div>
    );
  }

  const render = (nodes: TreeNode[], depth: number): React.ReactNode =>
    nodes.map((node) =>
      node.type === "dir" ? (
        <div key={node.path}>
          <button
            className="tree-dir"
            style={{ paddingLeft: 9 + depth * 13 }}
            data-top={depth === 0}
            onClick={() =>
              setExpanded((prev) => {
                const next = new Set(prev);
                if (next.has(node.path)) next.delete(node.path);
                else next.add(node.path);
                return next;
              })
            }
          >
            <span className="tree-caret">{expanded.has(node.path) ? "▾" : "▸"}</span>
            <span className="truncate">{node.name}</span>
            {!expanded.has(node.path) && node.fileCount ? (
              <span className="tree-count mono">{node.fileCount}</span>
            ) : null}
          </button>
          {expanded.has(node.path) && render(node.children ?? [], depth + 1)}
        </div>
      ) : (
        <FileRow
          key={node.path}
          node={node}
          depth={depth}
          active={node.path === activePath}
          flagged={flagged.has(node.path)}
          onOpen={onOpen}
        />
      ),
    );

  return <div className="tree">{render(tree, 0)}</div>;
}

function FileRow({
  node,
  depth,
  active,
  flagged,
  showPath,
  onOpen,
}: {
  node: TreeNode;
  depth: number;
  active: boolean;
  flagged: boolean;
  showPath?: boolean;
  onOpen: (path: string) => void;
}) {
  const badge = fileBadge(node.path);
  return (
    <button
      className="tree-file"
      data-active={active}
      style={{ paddingLeft: 9 + depth * 13 }}
      onClick={() => onOpen(node.path)}
      title={node.path}
    >
      <span className={`file-badge badge-${badge.tone}`} data-active={active}>
        {badge.label}
      </span>
      <span className="truncate" style={{ flex: 1 }}>
        {showPath ? node.path : node.name}
      </span>
      {flagged && <span className="tree-dot" data-active={active} title="Open issues on this file" />}
    </button>
  );
}

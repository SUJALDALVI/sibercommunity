"use client";

/**
 * FileExplorer — sidebar file tree with create/rename/delete.
 */

import { useState, useRef } from "react";
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  Plus,
  Trash2,
  Pencil,
  FolderPlus,
} from "lucide-react";
import type { FileNode } from "@/lib/ide/types";

interface Props {
  tree: FileNode[];
  selectedFileId: string | null;
  onSelectFile: (id: string) => void;
  onCreateFile: (parentId: string | null, name: string, type: "file" | "folder") => void;
  onRenameFile: (id: string, newName: string) => void;
  onDeleteFile: (id: string, name: string) => void;
}

export default function FileExplorer({
  tree,
  selectedFileId,
  onSelectFile,
  onCreateFile,
  onRenameFile,
  onDeleteFile,
}: Props) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-400">
          Files
        </span>
        <div className="flex gap-1">
          <NodeCreateButton label="New file" icon={<Plus size={12} />} onConfirm={(name) => onCreateFile(null, name, "file")} />
          <NodeCreateButton label="New folder" icon={<FolderPlus size={12} />} onConfirm={(name) => onCreateFile(null, name, "folder")} />
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {tree.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-zinc-600">
            No files yet.
            <br />
            Create a file to get started.
          </p>
        ) : (
          tree.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              selectedFileId={selectedFileId}
              onSelectFile={onSelectFile}
              onCreateFile={onCreateFile}
              onRenameFile={onRenameFile}
              onDeleteFile={onDeleteFile}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ── TreeNode ─────────────────────────────────────────────────── */
function TreeNode({
  node,
  depth,
  selectedFileId,
  onSelectFile,
  onCreateFile,
  onRenameFile,
  onDeleteFile,
}: {
  node: FileNode;
  depth: number;
  selectedFileId: string | null;
  onSelectFile: (id: string) => void;
  onCreateFile: (parentId: string | null, name: string, type: "file" | "folder") => void;
  onRenameFile: (id: string, newName: string) => void;
  onDeleteFile: (id: string, name: string) => void;
}) {
  const [open, setOpen] = useState(depth === 0);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.name);
  const renameRef = useRef<HTMLInputElement>(null);

  const isFolder = node.type === "folder";
  const isSelected = node.id === selectedFileId;
  const indent = depth * 12;

  const handleToggle = () => {
    if (isFolder) setOpen((o) => !o);
    else onSelectFile(node.id);
  };

  const handleRenameSubmit = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== node.name) {
      onRenameFile(node.id, trimmed);
    }
    setRenaming(false);
  };

  return (
    <div>
      <div
        className={`group flex cursor-pointer items-center gap-1 rounded-lg px-2 py-[3px] text-sm transition hover:bg-white/5 ${
          isSelected ? "bg-red-500/10 text-white" : "text-zinc-300"
        }`}
        style={{ paddingLeft: `${8 + indent}px` }}
        onClick={renaming ? undefined : handleToggle}
      >
        {/* Expand icon */}
        <span className="shrink-0 text-zinc-500">
          {isFolder ? (
            open ? <ChevronDown size={13} /> : <ChevronRight size={13} />
          ) : (
            <span className="inline-block w-[13px]" />
          )}
        </span>

        {/* File/folder icon */}
        <span className="shrink-0">
          {isFolder ? (
            open ? (
              <FolderOpen size={14} className="text-amber-400" />
            ) : (
              <Folder size={14} className="text-amber-400" />
            )
          ) : (
            <File size={14} className="text-zinc-400" />
          )}
        </span>

        {/* Name / rename input */}
        {renaming ? (
          <input
            ref={renameRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameSubmit();
              if (e.key === "Escape") { setRenaming(false); setRenameValue(node.name); }
            }}
            autoFocus
            className="min-w-0 flex-1 rounded bg-[#1a1929] px-1 py-0 text-sm text-white outline-none ring-1 ring-red-500/40"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm leading-5">{node.name}</span>
        )}

        {/* Action buttons (visible on hover) */}
        {!renaming && (
          <span className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
            {isFolder && (
              <>
                <NodeCreateButton
                  label="New file"
                  icon={<Plus size={11} />}
                  onConfirm={(name) => { onCreateFile(node.id, name, "file"); setOpen(true); }}
                  stopPropagation
                />
                <NodeCreateButton
                  label="New folder"
                  icon={<FolderPlus size={11} />}
                  onConfirm={(name) => { onCreateFile(node.id, name, "folder"); setOpen(true); }}
                  stopPropagation
                />
              </>
            )}
            <button
              type="button"
              title="Rename"
              onClick={(e) => {
                e.stopPropagation();
                setRenameValue(node.name);
                setRenaming(true);
                setTimeout(() => renameRef.current?.select(), 50);
              }}
              className="rounded p-0.5 hover:bg-white/10 hover:text-white"
            >
              <Pencil size={11} />
            </button>
            <button
              type="button"
              title="Delete"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteFile(node.id, node.name);
              }}
              className="rounded p-0.5 hover:bg-red-500/20 hover:text-red-400"
            >
              <Trash2 size={11} />
            </button>
          </span>
        )}
      </div>

      {/* Children */}
      {isFolder && open && node.children && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedFileId={selectedFileId}
              onSelectFile={onSelectFile}
              onCreateFile={onCreateFile}
              onRenameFile={onRenameFile}
              onDeleteFile={onDeleteFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── NodeCreateButton — inline new-file prompt ────────────────── */
function NodeCreateButton({
  label,
  icon,
  onConfirm,
  stopPropagation = false,
}: {
  label: string;
  icon: React.ReactNode;
  onConfirm: (name: string) => void;
  stopPropagation?: boolean;
}) {
  const [active, setActive] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed) onConfirm(trimmed);
    setValue("");
    setActive(false);
  };

  if (active) {
    return (
      <input
        ref={inputRef}
        value={value}
        placeholder={label}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { setValue(""); setActive(false); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") { setValue(""); setActive(false); }
          e.stopPropagation();
        }}
        autoFocus
        className="w-24 rounded bg-[#1a1929] px-1.5 py-0.5 text-xs text-white outline-none ring-1 ring-red-500/40"
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <button
      type="button"
      title={label}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        setActive(true);
        setTimeout(() => inputRef.current?.focus(), 30);
      }}
      className="rounded p-0.5 hover:bg-white/10 hover:text-white"
    >
      {icon}
    </button>
  );
}

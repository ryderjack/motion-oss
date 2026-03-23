"use client";

import { useState, useRef, useEffect } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Plus, GripVertical, Check, Trash2, ExternalLink } from "lucide-react";
import { useUpdateCell, useAddRow, useUpdateProperty, useDeleteRow } from "@/hooks/use-database";
import { type PageDetail } from "@/hooks/use-pages";

const COLUMN_COLORS: Record<string, string> = {
  gray: "border-t-gray-400",
  blue: "border-t-blue-500",
  green: "border-t-green-500",
  red: "border-t-red-500",
  yellow: "border-t-yellow-500",
  purple: "border-t-purple-500",
  pink: "border-t-pink-500",
  orange: "border-t-orange-500",
};

const BADGE_COLORS: Record<string, string> = {
  gray: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  green: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  red: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  purple: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  pink: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  orange: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

const OPTION_COLORS = ["gray", "blue", "green", "red", "yellow", "purple", "pink", "orange"];

const SWATCH_COLORS: Record<string, string> = {
  gray: "bg-gray-400",
  blue: "bg-blue-500",
  green: "bg-green-500",
  red: "bg-red-500",
  yellow: "bg-yellow-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
  orange: "bg-orange-500",
};

interface KanbanViewProps {
  page: PageDetail;
  groupByProperty: PageDetail["properties"][0];
  onRowOpen?: (pageId: string) => void;
}

export function KanbanView({ page, groupByProperty, onRowOpen }: KanbanViewProps) {
  const updateCell = useUpdateCell();
  const addRow = useAddRow();
  const updateProperty = useUpdateProperty();
  const deleteRow = useDeleteRow();

  const options = (
    groupByProperty.options as { options?: Array<{ value: string; color: string }> }
  )?.options || [];

  const titleProperty = page.properties.find((p) => p.type === "text");

  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editColor, setEditColor] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const newColumnInputRef = useRef<HTMLInputElement>(null);

  const [addingRowInColumn, setAddingRowInColumn] = useState<string | null>(null);
  const [newRowTitle, setNewRowTitle] = useState("");
  const newRowInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addingColumn && newColumnInputRef.current) {
      newColumnInputRef.current.focus();
    }
  }, [addingColumn]);

  useEffect(() => {
    if (addingRowInColumn && newRowInputRef.current) {
      newRowInputRef.current.focus();
    }
  }, [addingRowInColumn]);

  function handleCreateRow(columnValue: string) {
    const trimmed = newRowTitle.trim();
    if (!trimmed) {
      setAddingRowInColumn(null);
      setNewRowTitle("");
      return;
    }
    const cells: Array<{ propertyId: string; value: unknown }> = [
      { propertyId: groupByProperty.id, value: columnValue },
    ];
    if (titleProperty) {
      cells.push({ propertyId: titleProperty.id, value: trimmed });
    }
    addRow.mutate({ pageId: page.id, cells });
    setAddingRowInColumn(null);
    setNewRowTitle("");
  }

  function getRowsForColumn(columnValue: string) {
    return page.rows.filter((row) => {
      const cell = row.cells.find((c) => c.propertyId === groupByProperty.id);
      const val = cell?.value;
      return val === columnValue;
    });
  }

  function getUngroupedRows() {
    return page.rows.filter((row) => {
      const cell = row.cells.find((c) => c.propertyId === groupByProperty.id);
      return !cell?.value || !options.some((o) => o.value === cell.value);
    });
  }

  function getRowTitle(row: PageDetail["rows"][0]) {
    if (!titleProperty) return "Untitled";
    const cell = row.cells.find((c) => c.propertyId === titleProperty.id);
    return (typeof cell?.value === "string" ? cell.value : "") || "Untitled";
  }

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const rowId = result.draggableId;
    const newColumn = result.destination.droppableId;

    if (newColumn === "__ungrouped") return;

    updateCell.mutate({
      pageId: page.id,
      propertyId: groupByProperty.id,
      rowId,
      value: newColumn,
    });
  }

  function commitColumnEdit(oldValue: string, newValue: string, newColor: string) {
    const trimmed = newValue.trim();
    if (!trimmed) {
      setEditingColumn(null);
      return;
    }

    const nameChanged = trimmed !== oldValue;
    const oldOption = options.find((o) => o.value === oldValue);
    const colorChanged = oldOption && newColor !== oldOption.color;

    if (!nameChanged && !colorChanged) {
      setEditingColumn(null);
      return;
    }

    if (nameChanged && options.some((o) => o.value === trimmed && o.value !== oldValue)) {
      setEditingColumn(null);
      return;
    }

    const newOptions = options.map((o) =>
      o.value === oldValue
        ? { ...o, value: trimmed, color: newColor }
        : o
    );
    updateProperty.mutate({
      pageId: page.id,
      id: groupByProperty.id,
      options: { ...groupByProperty.options as object, options: newOptions },
    });

    if (nameChanged) {
      const rowsInColumn = getRowsForColumn(oldValue);
      for (const row of rowsInColumn) {
        updateCell.mutate({
          pageId: page.id,
          propertyId: groupByProperty.id,
          rowId: row.id,
          value: trimmed,
        });
      }
    }
    setEditingColumn(null);
  }

  function handleAddColumn() {
    const trimmed = newColumnName.trim();
    if (!trimmed) {
      setAddingColumn(false);
      return;
    }
    if (options.some((o) => o.value === trimmed)) {
      setAddingColumn(false);
      setNewColumnName("");
      return;
    }
    const newOptions = [
      ...options,
      { value: trimmed, color: OPTION_COLORS[options.length % OPTION_COLORS.length] },
    ];
    updateProperty.mutate({
      pageId: page.id,
      id: groupByProperty.id,
      options: { ...groupByProperty.options as object, options: newOptions },
    });
    setNewColumnName("");
    setAddingColumn(false);
  }

  function handleDeleteColumn(columnValue: string) {
    const rowsInColumn = getRowsForColumn(columnValue);
    for (const row of rowsInColumn) {
      deleteRow.mutate({ pageId: page.id, rowId: row.id });
    }
    const newOptions = options.filter((o) => o.value !== columnValue);
    updateProperty.mutate({
      pageId: page.id,
      id: groupByProperty.id,
      options: { ...groupByProperty.options as object, options: newOptions },
    });
    setEditingColumn(null);
    setConfirmingDelete(false);
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {options.map((option) => {
          const rows = getRowsForColumn(option.value);
          const isEditing = editingColumn === option.value;
          return (
            <div
              key={option.value}
              className={`shrink-0 w-72 rounded-lg border border-t-4 bg-muted/30 flex flex-col ${
                COLUMN_COLORS[option.color] || COLUMN_COLORS.gray
              }`}
            >
              <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Popover
                    open={isEditing}
                    onOpenChange={(open) => {
                      if (open) {
                        setEditingColumn(option.value);
                        setEditValue(option.value);
                        setEditColor(option.color);
                        setConfirmingDelete(false);
                      } else {
                        if (!confirmingDelete) {
                          commitColumnEdit(option.value, editValue, editColor);
                        }
                        setConfirmingDelete(false);
                      }
                    }}
                  >
                    <PopoverTrigger className="flex items-center">
                        <Badge
                          variant="secondary"
                          className={`cursor-pointer hover:opacity-80 transition-opacity ${BADGE_COLORS[option.color] || BADGE_COLORS.gray}`}
                        >
                          {option.value}
                        </Badge>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-3" align="start">
                      <div className="space-y-3">
                        <Input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitColumnEdit(option.value, editValue, editColor);
                            if (e.key === "Escape") setEditingColumn(null);
                          }}
                          placeholder="Column name"
                          className="h-8 text-sm"
                          autoFocus
                        />
                        <div>
                          <span className="text-xs font-medium text-muted-foreground mb-1.5 block">Color</span>
                          <div className="flex flex-wrap gap-1.5">
                            {OPTION_COLORS.map((color) => (
                              <button
                                key={color}
                                className={`h-6 w-6 rounded-full border-2 transition-all flex items-center justify-center ${
                                  SWATCH_COLORS[color]
                                } ${
                                  editColor === color
                                    ? "border-foreground scale-110"
                                    : "border-transparent hover:border-muted-foreground/50"
                                }`}
                                onClick={() => setEditColor(color)}
                              >
                                {editColor === color && (
                                  <Check className="h-3 w-3 text-white" />
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="border-t pt-3">
                          {confirmingDelete ? (
                            <div className="space-y-2">
                              <p className="text-xs text-destructive font-medium">
                                Delete &ldquo;{option.value}&rdquo; and {rows.length} {rows.length === 1 ? "card" : "cards"}?
                              </p>
                              <div className="flex gap-2">
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="h-7 text-xs flex-1"
                                  onClick={() => handleDeleteColumn(option.value)}
                                >
                                  Delete
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs flex-1"
                                  onClick={() => setConfirmingDelete(false)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 h-7 text-xs"
                              onClick={() => setConfirmingDelete(true)}
                            >
                              <Trash2 className="h-3 w-3 mr-1.5" />
                              Delete column
                            </Button>
                          )}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <span className="text-xs text-muted-foreground">
                    {rows.length}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => {
                    setAddingRowInColumn(option.value);
                    setNewRowTitle("");
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>

              <Droppable droppableId={option.value}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`min-h-[60px] px-2 pb-2 space-y-2 flex-1 ${
                      snapshot.isDraggingOver ? "bg-accent/50 rounded-b-lg" : ""
                    }`}
                  >
                    {rows.map((row, index) => (
                      <Draggable
                        key={row.id}
                        draggableId={row.id}
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`rounded-md border bg-card p-3 shadow-sm group/card ${
                              snapshot.isDragging ? "shadow-lg rotate-2" : ""
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <div
                                {...provided.dragHandleProps}
                                className="mt-0.5 cursor-grab"
                              >
                                <GripVertical className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1">
                                  <KanbanCardTitle
                                    row={row}
                                    titleProperty={titleProperty}
                                    pageId={page.id}
                                  />
                                  {onRowOpen && (
                                    <button
                                      className="p-0.5 rounded hover:bg-muted shrink-0 opacity-0 group-hover/card:opacity-100 transition-opacity"
                                      onClick={() => {
                                        const title = getRowTitle(row);
                                        const existing = page.children?.find((c) => c.title === title);
                                        if (existing) onRowOpen(existing.id);
                                      }}
                                    >
                                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                                    </button>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {page.properties
                                    .filter(
                                      (p) =>
                                        p.id !== groupByProperty.id &&
                                        p.id !== titleProperty?.id
                                    )
                                    .map((prop) => {
                                      const cell = row.cells.find(
                                        (c) => c.propertyId === prop.id
                                      );
                                      if (!cell?.value) return null;
                                      return (
                                        <span
                                          key={prop.id}
                                          className="text-xs text-muted-foreground"
                                        >
                                          {String(cell.value)}
                                        </span>
                                      );
                                    })}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>

              <div className="px-2 pb-2">
                {addingRowInColumn === option.value ? (
                  <Input
                    ref={newRowInputRef}
                    value={newRowTitle}
                    onChange={(e) => setNewRowTitle(e.target.value)}
                    onBlur={() => handleCreateRow(option.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateRow(option.value);
                      if (e.key === "Escape") {
                        setAddingRowInColumn(null);
                        setNewRowTitle("");
                      }
                    }}
                    placeholder="Enter a title…"
                    className="h-8 text-sm"
                  />
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-muted-foreground hover:text-foreground h-8 text-xs"
                    onClick={() => {
                      setAddingRowInColumn(option.value);
                      setNewRowTitle("");
                    }}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    New
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        {getUngroupedRows().length > 0 && (
          <div className="shrink-0 w-72 rounded-lg border bg-muted/30 flex flex-col">
            <div className="px-3 py-2">
              <span className="text-sm font-medium text-muted-foreground">
                No status
              </span>
              <span className="ml-2 text-xs text-muted-foreground">
                {getUngroupedRows().length}
              </span>
            </div>
            <Droppable droppableId="__ungrouped">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="min-h-[60px] px-2 pb-2 space-y-2 flex-1"
                >
                  {getUngroupedRows().map((row, index) => (
                    <Draggable
                      key={row.id}
                      draggableId={row.id}
                      index={index}
                    >
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className="rounded-md border bg-card p-3 shadow-sm"
                        >
                          <p className="font-medium text-sm">
                            {getRowTitle(row)}
                          </p>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        )}

        {/* Add new column */}
        <div className="shrink-0 w-72">
          {addingColumn ? (
            <div className="rounded-lg border border-dashed bg-muted/20 p-3">
              <Input
                ref={newColumnInputRef}
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                onBlur={handleAddColumn}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddColumn();
                  if (e.key === "Escape") {
                    setAddingColumn(false);
                    setNewColumnName("");
                  }
                }}
                placeholder="Column name"
                className="h-8 text-sm"
              />
            </div>
          ) : (
            <Button
              variant="ghost"
              className="w-full h-10 border border-dashed rounded-lg text-muted-foreground hover:text-foreground hover:border-solid justify-start"
              onClick={() => setAddingColumn(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add column
            </Button>
          )}
        </div>
      </div>
    </DragDropContext>
  );
}

function KanbanCardTitle({
  row,
  titleProperty,
  pageId,
}: {
  row: PageDetail["rows"][0];
  titleProperty: PageDetail["properties"][0] | undefined;
  pageId: string;
}) {
  const updateCell = useUpdateCell();
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentValue = titleProperty
    ? (row.cells.find((c) => c.propertyId === titleProperty.id)?.value as string) || ""
    : "";
  const [localValue, setLocalValue] = useState(currentValue);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    setLocalValue(currentValue);
  }, [currentValue]);

  function commit() {
    setEditing(false);
    if (!titleProperty) return;
    const trimmed = localValue.trim();
    if (trimmed !== currentValue) {
      updateCell.mutate({
        pageId,
        propertyId: titleProperty.id,
        rowId: row.id,
        value: trimmed || null,
      });
    }
  }

  if (!titleProperty) {
    return <p className="font-medium text-sm truncate text-muted-foreground flex-1">Untitled</p>;
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setLocalValue(currentValue);
            setEditing(false);
          }
        }}
        className="h-6 text-sm font-medium px-1 py-0 border-none shadow-none bg-transparent flex-1"
      />
    );
  }

  return (
    <p
      className="font-medium text-sm truncate cursor-text hover:bg-muted/50 rounded px-1 -mx-1 flex-1"
      onClick={() => setEditing(true)}
    >
      {currentValue || "Untitled"}
    </p>
  );
}

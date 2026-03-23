"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Trash2, ArrowUpDown, ExternalLink, MoreVertical, GripVertical, Search, Filter, X } from "lucide-react";
import { useUpdateCell, useDeleteRow, useDeleteProperty, useUpdateProperty, useReorderProperties } from "@/hooks/use-database";
import { type PageDetail } from "@/hooks/use-pages";

const SELECT_COLORS: Record<string, string> = {
  gray: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  green: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  red: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  purple: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  pink: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  orange: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

const SELECT_SWATCH_COLORS: Record<string, string> = {
  gray: "bg-gray-200 dark:bg-gray-700",
  blue: "bg-blue-200 dark:bg-blue-800",
  green: "bg-green-200 dark:bg-green-800",
  red: "bg-red-200 dark:bg-red-800",
  yellow: "bg-yellow-200 dark:bg-yellow-800",
  purple: "bg-purple-200 dark:bg-purple-800",
  pink: "bg-pink-200 dark:bg-pink-800",
  orange: "bg-orange-200 dark:bg-orange-800",
};

interface TableViewProps {
  page: PageDetail;
  onRowOpen?: (pageId: string) => void;
}

export function TableView({ page, onRowOpen }: TableViewProps) {
  const updateCell = useUpdateCell();
  const deleteRow = useDeleteRow();
  const deleteProperty = useDeleteProperty();
  const updateProperty = useUpdateProperty();
  const reorderProperties = useReorderProperties();
  const [columnOrder, setColumnOrder] = useState<string[] | null>(null);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [confirmDeleteRow, setConfirmDeleteRow] = useState<string | null>(null);
  const [editingProp, setEditingProp] = useState<string | null>(null);
  const [editPropName, setEditPropName] = useState("");
  const [editPropType, setEditPropType] = useState("");
  const [editPropOptions, setEditPropOptions] = useState<Array<{ value: string; color: string }>>([]);
  const [newEditOptionValue, setNewEditOptionValue] = useState("");
  const [editDefaultValue, setEditDefaultValue] = useState<unknown>(null);
  const optionColors = ["gray", "blue", "green", "red", "yellow", "purple", "pink", "orange"];

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<string, string | boolean>>({});
  const [showFilters, setShowFilters] = useState(false);

  function updateFilter(key: string, value: string | boolean | null) {
    setActiveFilters((prev) => {
      if (value === null) {
        const next: Record<string, string | boolean> = {};
        for (const k in prev) if (k !== key) next[k] = prev[k];
        return next;
      }
      const next: Record<string, string | boolean> = { ...prev };
      next[key] = value;
      return next;
    });
  }
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filterableProperties = useMemo(
    () => page.properties.filter((p) => p.type === "select" || p.type === "checkbox"),
    [page.properties]
  );

  const hasActiveFilters = searchQuery.trim() !== "" || Object.keys(activeFilters).length > 0;

  const propertyIds = page.properties.map((p) => p.id).join(",");
  useEffect(() => {
    setColumnOrder(null);
  }, [propertyIds]);

  const orderedProperties = columnOrder
    ? columnOrder
        .map((id) => page.properties.find((p) => p.id === id))
        .filter(Boolean) as PageDetail["properties"]
    : page.properties;

  function handleColumnDragEnd(result: DropResult) {
    if (!result.destination) return;
    const srcIdx = result.source.index;
    const destIdx = result.destination.index;
    if (srcIdx === destIdx) return;

    const ids = orderedProperties.map((p) => p.id);
    const [moved] = ids.splice(srcIdx, 1);
    ids.splice(destIdx, 0, moved);

    setColumnOrder(ids);

    const order = ids.map((id, i) => ({ id, position: i }));
    reorderProperties.mutate({ pageId: page.id, order });
  }

  function getCellValue(rowId: string, propertyId: string): unknown {
    const cell = page.rows
      .find((r) => r.id === rowId)
      ?.cells.find((c) => c.propertyId === propertyId);
    return cell?.value ?? null;
  }

  function handleSort(propertyId: string) {
    if (sortBy === propertyId) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(propertyId);
      setSortDir("asc");
    }
  }

  const filteredRows = useMemo(() => {
    let rows = page.rows;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter((row) =>
        page.properties.some((prop) => {
          const val = row.cells.find((c) => c.propertyId === prop.id)?.value;
          if (typeof val === "string") return val.toLowerCase().includes(q);
          if (typeof val === "number") return String(val).includes(q);
          return false;
        })
      );
    }

    for (const [propertyId, filterValue] of Object.entries(activeFilters)) {
      rows = rows.filter((row) => {
        const val = row.cells.find((c) => c.propertyId === propertyId)?.value;
        if (typeof filterValue === "boolean") return val === filterValue;
        return val === filterValue;
      });
    }

    return rows;
  }, [page.rows, page.properties, searchQuery, activeFilters]);

  const sortedRows = [...filteredRows].sort((a, b) => {
    if (!sortBy) return a.position - b.position;
    const aVal = getCellValue(a.id, sortBy);
    const bVal = getCellValue(b.id, sortBy);
    const aStr = typeof aVal === "string" ? aVal : JSON.stringify(aVal ?? "");
    const bStr = typeof bVal === "string" ? bVal : JSON.stringify(bVal ?? "");
    return sortDir === "asc"
      ? aStr.localeCompare(bStr)
      : bStr.localeCompare(aStr);
  });

  const colCount = orderedProperties.length;
  const gridCols = `repeat(${colCount}, minmax(150px, 1fr)) 40px`;

  return (
    <div className="space-y-2">
      {/* Search & Filter Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search rows..."
            className="h-8 pl-8 pr-8 text-sm"
          />
          {searchQuery && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearchQuery("")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {filterableProperties.length > 0 && (
          <Button
            variant={showFilters ? "secondary" : "outline"}
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-3.5 w-3.5" />
            Filter
            {Object.keys(activeFilters).length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs ml-0.5">
                {Object.keys(activeFilters).length}
              </Badge>
            )}
          </Button>
        )}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => {
              setSearchQuery("");
              setActiveFilters({});
            }}
          >
            Clear all
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums shrink-0">
          {hasActiveFilters
            ? `${sortedRows.length} of ${page.rows.length}`
            : page.rows.length}{" "}
          row{page.rows.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Filter Row */}
      {showFilters && filterableProperties.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {filterableProperties.map((prop) => {
            const options = (prop.options as { options?: Array<{ value: string; color: string }> })?.options;
            const currentFilter = activeFilters[prop.id];

            if (prop.type === "select" && options) {
              const selectedOpt = typeof currentFilter === "string"
                ? options.find((o) => o.value === currentFilter)
                : null;
              return (
                <div key={prop.id} className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">{prop.name}:</span>
                  <Select
                    value={typeof currentFilter === "string" ? currentFilter : ""}
                    onValueChange={(v) => {
                      updateFilter(prop.id, v === "__all__" ? null : v);
                    }}
                  >
                    <SelectTrigger className="h-7 w-auto min-w-[100px] text-xs gap-1">
                      {selectedOpt ? (
                        <Badge
                          variant="secondary"
                          className={`text-xs ${SELECT_COLORS[selectedOpt.color] || SELECT_COLORS.gray}`}
                        >
                          {selectedOpt.value}
                        </Badge>
                      ) : (
                        <span>All</span>
                      )}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All</SelectItem>
                      {options.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <Badge
                            variant="secondary"
                            className={`text-xs ${SELECT_COLORS[opt.color] || SELECT_COLORS.gray}`}
                          >
                            {opt.value}
                          </Badge>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            }

            if (prop.type === "checkbox") {
              const checkboxLabel =
                currentFilter === true ? "Checked" : currentFilter === false ? "Unchecked" : "All";
              return (
                <div key={prop.id} className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">{prop.name}:</span>
                  <Select
                    value={
                      currentFilter === true
                        ? "checked"
                        : currentFilter === false
                          ? "unchecked"
                          : ""
                    }
                    onValueChange={(v) => {
                      updateFilter(prop.id, v === "__all__" ? null : v === "checked");
                    }}
                  >
                    <SelectTrigger className="h-7 w-auto min-w-[100px] text-xs gap-1">
                      <span>{checkboxLabel}</span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All</SelectItem>
                      <SelectItem value="checked">Checked</SelectItem>
                      <SelectItem value="unchecked">Unchecked</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              );
            }

            return null;
          })}
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border text-sm">
      <DragDropContext onDragEnd={handleColumnDragEnd}>
        {/* Header */}
        <Droppable droppableId="columns" direction="horizontal">
          {(droppableProvided) => (
            <div
              ref={droppableProvided.innerRef}
              {...droppableProvided.droppableProps}
              className="flex border-b"
            >
              {orderedProperties.map((prop, index) => {
                const currentOptions = (prop.options as { options?: Array<{ value: string; color: string }> })?.options || [];
                return (
                  <Draggable key={prop.id} draggableId={prop.id} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={`flex-1 min-w-[150px] h-10 px-2 flex items-center font-medium text-foreground select-none whitespace-nowrap ${snapshot.isDragging ? "bg-muted shadow-md rounded-md z-10" : ""}`}
                      >
                        <div className="flex items-center gap-1 w-full">
                          <span
                            {...provided.dragHandleProps}
                            className="cursor-grab active:cursor-grabbing text-muted-foreground shrink-0"
                          >
                            <GripVertical className="h-3.5 w-3.5" />
                          </span>
                          <span
                            className="cursor-pointer flex items-center gap-1 flex-1"
                            onClick={() => handleSort(prop.id)}
                          >
                            {prop.name}
                            <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                          </span>
                          <Popover
                            open={editingProp === prop.id}
                            onOpenChange={(open) => {
                              if (open) {
                                setEditingProp(prop.id);
                                setEditPropName(prop.name);
                                setEditPropType(prop.type);
                                setEditPropOptions(currentOptions);
                                setNewEditOptionValue("");
                                const currentDefault = (prop.options as { defaultValue?: unknown })?.defaultValue ?? null;
                                setEditDefaultValue(currentDefault);
                              } else {
                                setEditingProp(null);
                              }
                            }}
                          >
                            <PopoverTrigger render={<button className="p-0.5 rounded hover:bg-muted" />}>
                              <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                            </PopoverTrigger>
                            <PopoverContent className="w-72" align="end">
                              <div className="space-y-3">
                                <div className="space-y-1">
                                  <Label className="text-xs">Name</Label>
                                  <Input
                                    value={editPropName}
                                    onChange={(e) => setEditPropName(e.target.value)}
                                    autoFocus
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Type</Label>
                                  <Select value={editPropType} onValueChange={(v) => v != null && setEditPropType(v)}>
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="text">Text</SelectItem>
                                      <SelectItem value="number">Number</SelectItem>
                                      <SelectItem value="select">Select</SelectItem>
                                      <SelectItem value="date">Date</SelectItem>
                                      <SelectItem value="checkbox">Checkbox</SelectItem>
                                      <SelectItem value="url">URL</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                {editPropType === "select" && (
                                  <div className="space-y-2">
                                    <Label className="text-xs">Options</Label>
                                    {editPropOptions.map((opt, i) => (
                                      <div key={i} className="flex items-center gap-1.5">
                                        <button
                                          className={`h-5 w-5 rounded-full shrink-0 border ${SELECT_SWATCH_COLORS[opt.color] || SELECT_SWATCH_COLORS.gray}`}
                                          onClick={() => {
                                            const next = [...editPropOptions];
                                            const ci = optionColors.indexOf(opt.color);
                                            next[i] = { ...opt, color: optionColors[(ci + 1) % optionColors.length] };
                                            setEditPropOptions(next);
                                          }}
                                        />
                                        <span className="text-sm flex-1 truncate">{opt.value}</span>
                                        <button
                                          className="text-xs text-muted-foreground hover:text-destructive"
                                          onClick={() => setEditPropOptions(editPropOptions.filter((_, j) => j !== i))}
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    ))}
                                    <div className="flex gap-1.5">
                                      <Input
                                        value={newEditOptionValue}
                                        onChange={(e) => setNewEditOptionValue(e.target.value)}
                                        placeholder="Option name"
                                        className="h-7 text-sm"
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter" && newEditOptionValue.trim()) {
                                            setEditPropOptions([...editPropOptions, {
                                              value: newEditOptionValue.trim(),
                                              color: optionColors[editPropOptions.length % optionColors.length],
                                            }]);
                                            setNewEditOptionValue("");
                                          }
                                        }}
                                      />
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2 shrink-0"
                                        disabled={!newEditOptionValue.trim()}
                                        onClick={() => {
                                          setEditPropOptions([...editPropOptions, {
                                            value: newEditOptionValue.trim(),
                                            color: optionColors[editPropOptions.length % optionColors.length],
                                          }]);
                                          setNewEditOptionValue("");
                                        }}
                                      >
                                        Add
                                      </Button>
                                    </div>
                                  </div>
                                )}
                                <div className="space-y-1">
                                  <Label className="text-xs">Default Value</Label>
                                  <DefaultValueEditor
                                    type={editPropType}
                                    value={editDefaultValue}
                                    onChange={setEditDefaultValue}
                                    options={editPropOptions}
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    className="flex-1"
                                    disabled={!editPropName.trim()}
                                    onClick={() => {
                                      const opts: Record<string, unknown> = {};
                                      if (editPropType === "select") opts.options = editPropOptions;
                                      if (editDefaultValue !== null && editDefaultValue !== "") opts.defaultValue = editDefaultValue;
                                      updateProperty.mutate({
                                        pageId: page.id,
                                        id: prop.id,
                                        name: editPropName.trim(),
                                        type: editPropType,
                                        options: Object.keys(opts).length > 0 ? opts : undefined,
                                      });
                                      setEditingProp(null);
                                    }}
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => {
                                      deleteProperty.mutate({ pageId: page.id, id: prop.id });
                                      setEditingProp(null);
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                    )}
                  </Draggable>
                );
              })}
              {droppableProvided.placeholder}
              <div className="w-10 shrink-0" />
            </div>
          )}
        </Droppable>

        {/* Body */}
        <div>
          {sortedRows.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No rows yet. Click &quot;+ Row&quot; to add one.
            </div>
          ) : (
            sortedRows.map((row) => {
              const firstProp = orderedProperties[0];
              const rowTitle = firstProp
                ? String(getCellValue(row.id, firstProp.id) || "Untitled")
                : "Untitled";

              function handleOpenRow() {
                if (!onRowOpen) return;
                const existingChild = page.children?.find(
                  (c) => c.title === rowTitle
                );
                if (existingChild) {
                  onRowOpen(existingChild.id);
                }
              }

              return (
                <div
                  key={row.id}
                  className="flex border-b last:border-b-0 transition-colors hover:bg-muted/50 group"
                >
                  {orderedProperties.map((prop, propIdx) => (
                    <div key={prop.id} className="flex-1 min-w-[150px] p-1 align-middle">
                      {propIdx === 0 ? (
                        <div className="flex items-center gap-1">
                          <div className="flex-1">
                            <CellEditor
                              pageId={page.id}
                              rowId={row.id}
                              property={prop}
                              value={getCellValue(row.id, prop.id)}
                              onSave={(value) =>
                                updateCell.mutate({
                                  pageId: page.id,
                                  propertyId: prop.id,
                                  rowId: row.id,
                                  value,
                                })
                              }
                            />
                          </div>
                          {onRowOpen && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
                              onClick={handleOpenRow}
                            >
                              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          )}
                        </div>
                      ) : (
                        <CellEditor
                          pageId={page.id}
                          rowId={row.id}
                          property={prop}
                          value={getCellValue(row.id, prop.id)}
                          onSave={(value) =>
                            updateCell.mutate({
                              pageId: page.id,
                              propertyId: prop.id,
                              rowId: row.id,
                              value,
                            })
                          }
                        />
                      )}
                    </div>
                  ))}
                  <div className="w-10 shrink-0 p-1 flex items-center justify-center relative">
                    {confirmDeleteRow === row.id ? (
                      <div className="absolute right-0 flex items-center gap-1 bg-background border rounded-md shadow-sm px-1.5 py-1 z-10">
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-7 text-xs px-2"
                          onClick={() => {
                            deleteRow.mutate({ pageId: page.id, rowId: row.id });
                            setConfirmDeleteRow(null);
                          }}
                        >
                          Delete
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs px-2"
                          onClick={() => setConfirmDeleteRow(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100"
                        onClick={() => setConfirmDeleteRow(row.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DragDropContext>
      </div>

    </div>
  );
}

interface CellEditorProps {
  pageId: string;
  rowId: string;
  property: PageDetail["properties"][0];
  value: unknown;
  onSave: (value: unknown) => void;
}

function CellEditor({ property, value, onSave }: CellEditorProps) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(
    typeof value === "string" ? value : ""
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const options = (property.options as { options?: Array<{ value: string; color: string }> })
    ?.options;

  switch (property.type) {
    case "select": {
      const selectedOpt = options?.find((o) => o.value === value);
      return (
        <Select
          value={typeof value === "string" ? value : ""}
          onValueChange={(v) => onSave(v)}
        >
          <SelectTrigger className="h-8 border-none shadow-none bg-transparent">
            {selectedOpt ? (
              <Badge
                variant="secondary"
                className={SELECT_COLORS[selectedOpt.color] || SELECT_COLORS.gray}
              >
                {selectedOpt.value}
              </Badge>
            ) : (
              <SelectValue placeholder="Select..." />
            )}
          </SelectTrigger>
          <SelectContent>
            {options?.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                <Badge
                  variant="secondary"
                  className={SELECT_COLORS[opt.color] || SELECT_COLORS.gray}
                >
                  {opt.value}
                </Badge>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    case "checkbox":
      return (
        <div className="flex items-center justify-center">
          <Checkbox
            checked={value === true}
            onCheckedChange={(checked) => onSave(checked)}
          />
        </div>
      );

    case "number":
      return editing ? (
        <Input
          ref={inputRef}
          type="number"
          className="h-8 border-none shadow-none bg-transparent"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={() => {
            setEditing(false);
            onSave(localValue ? Number(localValue) : null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setEditing(false);
              onSave(localValue ? Number(localValue) : null);
            }
          }}
        />
      ) : (
        <div
          className="h-8 flex items-center px-3 cursor-text min-w-[80px]"
          onClick={() => {
            setLocalValue(typeof value === "number" ? String(value) : "");
            setEditing(true);
          }}
        >
          {typeof value === "number" ? value : ""}
        </div>
      );

    case "date":
      return (
        <Input
          type="date"
          className="h-8 border-none shadow-none bg-transparent"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onSave(e.target.value)}
        />
      );

    case "url":
      return editing ? (
        <Input
          ref={inputRef}
          type="url"
          className="h-8 border-none shadow-none bg-transparent"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={() => {
            setEditing(false);
            onSave(localValue);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setEditing(false);
              onSave(localValue);
            }
          }}
        />
      ) : (
        <div
          className="h-8 flex items-center px-3 cursor-text min-w-[80px]"
          onClick={() => {
            setLocalValue(typeof value === "string" ? value : "");
            setEditing(true);
          }}
        >
          {typeof value === "string" && value ? (
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 dark:text-blue-400 underline truncate"
              onClick={(e) => e.stopPropagation()}
            >
              {value}
            </a>
          ) : (
            ""
          )}
        </div>
      );

    default:
      return editing ? (
        <Input
          ref={inputRef}
          className="h-8 border-none shadow-none bg-transparent"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={() => {
            setEditing(false);
            onSave(localValue);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setEditing(false);
              onSave(localValue);
            }
          }}
        />
      ) : (
        <div
          className="h-8 flex items-center px-3 cursor-text min-w-[80px]"
          onClick={() => {
            setLocalValue(typeof value === "string" ? value : "");
            setEditing(true);
          }}
        >
          {typeof value === "string" ? value : ""}
        </div>
      );
  }
}

function DefaultValueEditor({
  type,
  value,
  onChange,
  options,
}: {
  type: string;
  value: unknown;
  onChange: (v: unknown) => void;
  options: Array<{ value: string; color: string }>;
}) {
  switch (type) {
    case "checkbox":
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked === true ? true : null)}
          />
          <span className="text-xs text-muted-foreground">Checked by default</span>
        </div>
      );
    case "select": {
      const selectVal = typeof value === "string" ? value : "";
      return (
        <div className="flex gap-1.5">
          <Select
            value={selectVal}
            onValueChange={(v) => onChange(v || null)}
          >
            <SelectTrigger className="h-8 flex-1">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectVal && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-muted-foreground"
              onClick={() => onChange(null)}
            >
              Clear
            </Button>
          )}
        </div>
      );
    }
    case "number":
      return (
        <Input
          type="number"
          className="h-8"
          placeholder="No default"
          value={typeof value === "number" ? String(value) : typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        />
      );
    case "date":
      return (
        <Input
          type="date"
          className="h-8"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    default:
      return (
        <Input
          className="h-8"
          placeholder="No default"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
  }
}

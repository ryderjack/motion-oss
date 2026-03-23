"use client";

import { useEffect, useRef, useState } from "react";
import { TableView } from "./table-view";
import { KanbanView } from "./kanban-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, RotateCcw, MoreHorizontal, Lock, Unlock } from "lucide-react";
import { useAddRow, useAddProperty } from "@/hooks/use-database";
import { useUpdatePage, useRestorePage, usePermanentDeletePage, useDeletePage, type PageDetail } from "@/hooks/use-pages";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ShareDialog } from "@/components/editor/share-dialog";
import { EmojiPicker } from "@/components/editor/emoji-picker";
import { SmilePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { PageHistory } from "@/components/editor/page-history";

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

interface DatabaseViewProps {
  page: PageDetail;
  onPageSelect?: (pageId: string) => void;
  isAdmin?: boolean;
}

export function DatabaseView({ page, onPageSelect, isAdmin }: DatabaseViewProps) {
  const isBoard = page.viewMode === "board";
  const [title, setTitle] = useState(page.title);
  const titleTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const addRow = useAddRow();
  const addProperty = useAddProperty();
  const updatePage = useUpdatePage();
  const restorePage = useRestorePage();
  const permanentDelete = usePermanentDeletePage();
  const deletePage = useDeletePage();
  const router = useRouter();
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [propOpen, setPropOpen] = useState(false);
  const [propName, setPropName] = useState("");
  const [propType, setPropType] = useState("text");
  const [propOptions, setPropOptions] = useState<Array<{ value: string; color: string }>>([]);
  const [newOptionValue, setNewOptionValue] = useState("");
  const [propDefaultValue, setPropDefaultValue] = useState<unknown>(null);

  const optionColors = ["gray", "blue", "green", "red", "yellow", "purple", "pink", "orange"];

  useEffect(() => {
    setTitle(page.title);
  }, [page.id, page.title]);

  const selectProperty = page.properties.find((p) => p.type === "select");

  return (
    <div className="flex-1 overflow-y-auto relative bg-background">
      {page.isArchived && (
        <div className="sticky top-0 z-20 flex items-center justify-center gap-3 bg-destructive/10 border-b border-destructive/20 px-4 py-2.5">
          <Trash2 className="h-4 w-4 text-destructive shrink-0" />
          <span className="text-sm text-destructive font-medium">
            This page is in the trash.
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs border-destructive/30 hover:bg-destructive/10"
            onClick={() => restorePage.mutate({ pageId: page.id, parentId: page.parentId })}
            disabled={restorePage.isPending}
          >
            <RotateCcw className="h-3 w-3 mr-1.5" />
            Restore
          </Button>
          {isAdmin && (
            <Button
              variant="destructive"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                if (window.confirm("Permanently delete this page? This cannot be undone.")) {
                  permanentDelete.mutate(
                    { pageId: page.id },
                    { onSuccess: () => router.push("/") }
                  );
                }
              }}
              disabled={permanentDelete.isPending}
            >
              <Trash2 className="h-3 w-3 mr-1.5" />
              Delete forever
            </Button>
          )}
        </div>
      )}
      <div className="sticky top-0 z-10 bg-background border-b flex items-center min-h-12 px-4">
        <div className="max-w-5xl mx-auto px-2 flex-1 min-w-0">
          <Breadcrumbs pageId={page.id} onNavigate={onPageSelect} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <PageHistory pageId={page.id} />
          <ShareDialog pageId={page.id} pageTitle={page.title} isPrivate={page.isPrivate} createdBy={page.createdBy} />
          {!page.isArchived && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="bottom" sideOffset={4} className="min-w-[160px]">
                {isAdmin && (
                  <DropdownMenuItem
                    onClick={() => {
                      updatePage.mutate({ pageId: page.id, isLocked: !page.isLocked });
                    }}
                  >
                    {page.isLocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                    {page.isLocked ? "Unlock page" : "Lock page"}
                  </DropdownMenuItem>
                )}
                {(!page.isLocked || isAdmin) && (
                  <>
                    {isAdmin && <DropdownMenuSeparator />}
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => {
                        deletePage.mutate(
                          { pageId: page.id, parentId: page.parentId },
                          { onSuccess: () => router.push("/") }
                        );
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      Move to trash
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      <div className="max-w-5xl mx-auto px-6">

        <div className="flex items-center gap-2 mb-2">
          <div className="relative">
            <button
              className="text-4xl hover:bg-accent rounded p-1 transition-colors"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            >
              {page.icon || <SmilePlus className="h-8 w-8 text-muted-foreground" />}
            </button>
            {showEmojiPicker && (
              <EmojiPicker
                onSelect={(icon) => {
                  updatePage.mutate({ pageId: page.id, icon });
                  setShowEmojiPicker(false);
                }}
                onClose={() => setShowEmojiPicker(false)}
              />
            )}
          </div>
        </div>

        <input
          className="w-full text-4xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/50 mb-4"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (titleTimeoutRef.current) clearTimeout(titleTimeoutRef.current);
            titleTimeoutRef.current = setTimeout(() => {
              updatePage.mutate({ pageId: page.id, title: e.target.value });
            }, 500);
          }}
          placeholder="Untitled Database"
        />

        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1" />
          {!isBoard && (
            <>
              <Popover open={propOpen} onOpenChange={setPropOpen}>
                <PopoverTrigger render={<Button variant="outline" size="sm" />}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Property
                </PopoverTrigger>
                <PopoverContent className="w-72" align="end">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="prop-name" className="text-xs">Name</Label>
                      <Input
                        id="prop-name"
                        value={propName}
                        onChange={(e) => setPropName(e.target.value)}
                        placeholder="Property name"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Type</Label>
                      <Select
                        value={propType}
                        onValueChange={(v) => {
                          if (v == null) return;
                          setPropType(v);
                          if (v !== "select") setPropOptions([]);
                          setPropDefaultValue(null);
                        }}
                      >
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
                    {propType === "select" && (
                      <div className="space-y-2">
                        <Label className="text-xs">Options</Label>
                        {propOptions.map((opt, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <button
                              className={`h-5 w-5 rounded-full shrink-0 border ${SELECT_SWATCH_COLORS[opt.color] || SELECT_SWATCH_COLORS.gray}`}
                              onClick={() => {
                                const next = [...propOptions];
                                const ci = optionColors.indexOf(opt.color);
                                next[i] = { ...opt, color: optionColors[(ci + 1) % optionColors.length] };
                                setPropOptions(next);
                              }}
                              title="Change color"
                            />
                            <span className="text-sm flex-1 truncate">{opt.value}</span>
                            <button
                              className="text-xs text-muted-foreground hover:text-destructive"
                              onClick={() => setPropOptions(propOptions.filter((_, j) => j !== i))}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <div className="flex gap-1.5">
                          <Input
                            value={newOptionValue}
                            onChange={(e) => setNewOptionValue(e.target.value)}
                            placeholder="Option name"
                            className="h-7 text-sm"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && newOptionValue.trim()) {
                                setPropOptions([...propOptions, {
                                  value: newOptionValue.trim(),
                                  color: optionColors[propOptions.length % optionColors.length],
                                }]);
                                setNewOptionValue("");
                              }
                            }}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 shrink-0"
                            disabled={!newOptionValue.trim()}
                            onClick={() => {
                              setPropOptions([...propOptions, {
                                value: newOptionValue.trim(),
                                color: optionColors[propOptions.length % optionColors.length],
                              }]);
                              setNewOptionValue("");
                            }}
                          >
                            Add
                          </Button>
                        </div>
                      </div>
                    )}
                    <div className="space-y-1">
                      <Label className="text-xs">Default Value</Label>
                      {propType === "checkbox" ? (
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={propDefaultValue === true}
                            onCheckedChange={(checked) => setPropDefaultValue(checked === true ? true : null)}
                          />
                          <span className="text-xs text-muted-foreground">Checked by default</span>
                        </div>
                      ) : propType === "select" ? (
                        <div className="flex gap-1.5">
                          <Select
                            value={typeof propDefaultValue === "string" ? propDefaultValue : ""}
                            onValueChange={(v) => setPropDefaultValue(v || null)}
                          >
                            <SelectTrigger className="h-8 flex-1">
                              <SelectValue placeholder="None" />
                            </SelectTrigger>
                            <SelectContent>
                              {propOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.value}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {typeof propDefaultValue === "string" && propDefaultValue && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs text-muted-foreground"
                              onClick={() => setPropDefaultValue(null)}
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                      ) : propType === "number" ? (
                        <Input
                          type="number"
                          className="h-8"
                          placeholder="No default"
                          value={typeof propDefaultValue === "number" ? String(propDefaultValue) : ""}
                          onChange={(e) => setPropDefaultValue(e.target.value ? Number(e.target.value) : null)}
                        />
                      ) : propType === "date" ? (
                        <Input
                          type="date"
                          className="h-8"
                          value={typeof propDefaultValue === "string" ? propDefaultValue : ""}
                          onChange={(e) => setPropDefaultValue(e.target.value || null)}
                        />
                      ) : (
                        <Input
                          className="h-8"
                          placeholder="No default"
                          value={typeof propDefaultValue === "string" ? propDefaultValue : ""}
                          onChange={(e) => setPropDefaultValue(e.target.value || null)}
                        />
                      )}
                    </div>
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={!propName.trim() || (propType === "select" && propOptions.length === 0)}
                      onClick={() => {
                        const opts: Record<string, unknown> = {};
                        if (propType === "select") opts.options = propOptions;
                        if (propDefaultValue !== null && propDefaultValue !== "") opts.defaultValue = propDefaultValue;
                        addProperty.mutate({
                          pageId: page.id,
                          name: propName.trim(),
                          type: propType,
                          options: Object.keys(opts).length > 0 ? opts : undefined,
                        });
                        setPropName("");
                        setPropType("text");
                        setPropOptions([]);
                        setNewOptionValue("");
                        setPropDefaultValue(null);
                        setPropOpen(false);
                      }}
                    >
                      Add Property
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                variant="outline"
                size="sm"
                onClick={() => addRow.mutate({ pageId: page.id })}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Row
              </Button>
            </>
          )}
        </div>

        {isBoard ? (
          selectProperty ? (
            <KanbanView page={page} groupByProperty={selectProperty} onRowOpen={onPageSelect} />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p className="mb-2">This board needs a Select property to group cards by.</p>
              <p className="text-sm">Add a Select property to get started.</p>
            </div>
          )
        ) : (
          <TableView page={page} onRowOpen={onPageSelect} />
        )}
      </div>
    </div>
  );
}

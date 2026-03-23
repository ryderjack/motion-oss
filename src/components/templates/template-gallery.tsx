"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, FileText, Database, Trash2, LayoutTemplate, Pencil } from "lucide-react";
import { useWorkspaceStore } from "@/hooks/use-workspace";
import { useCreatePage } from "@/hooks/use-pages";
import { useState } from "react";
import { toast } from "sonner";
import { EmojiPicker } from "@/components/editor/emoji-picker";

interface Template {
  id: string;
  title: string;
  description: string | null;
  icon: string | null;
  type: "PAGE" | "DATABASE";
  blocks: unknown;
  properties: unknown;
}

export function TemplateGallery() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const queryClient = useQueryClient();
  const createPage = useCreatePage();
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["templates", workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/templates?workspaceId=${workspaceId}`);
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    },
    enabled: !!workspaceId,
  });

  const createTemplate = useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      type?: "PAGE" | "DATABASE";
    }) => {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, ...data }),
      });
      if (!res.ok) throw new Error("Failed to create template");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setCreateOpen(false);
      setTitle("");
      setDescription("");
      toast.success("Template created");
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async (data: {
      id: string;
      title?: string;
      description?: string;
      icon?: string;
    }) => {
      const res = await fetch("/api/templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update template");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setEditingTemplate(null);
      toast.success("Template updated");
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/templates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Failed to delete template");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Template deleted");
    },
  });

  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIcon, setEditIcon] = useState<string | null>(null);
  const [showIconPicker, setShowIconPicker] = useState(false);

  function startEditing(template: Template) {
    setEditingTemplate(template);
    setEditTitle(template.title);
    setEditDescription(template.description || "");
    setEditIcon(template.icon);
    setShowIconPicker(false);
  }

  async function handleUseTemplate(template: Template) {
    const page = await createPage.mutateAsync({
      title: template.title,
      type: template.type,
    });
    toast.success(`Created "${template.title}" from template`);
    return page;
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <LayoutTemplate className="h-8 w-8 text-muted-foreground" />
            <div>
              <h1 className="text-2xl font-bold">Templates</h1>
              <p className="text-sm text-muted-foreground">
                Create pages quickly from reusable templates
              </p>
            </div>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 h-9 px-4 py-2">
              <Plus className="h-4 w-4 mr-2" />
              New Template
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Template</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="template-title">Title</Label>
                  <Input
                    id="template-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Template name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="template-desc">Description</Label>
                  <Textarea
                    id="template-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What is this template for?"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() =>
                      createTemplate.mutate({
                        title,
                        description,
                        type: "PAGE",
                      })
                    }
                    disabled={!title}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Page Template
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() =>
                      createTemplate.mutate({
                        title,
                        description,
                        type: "DATABASE",
                      })
                    }
                    disabled={!title}
                  >
                    <Database className="h-4 w-4 mr-2" />
                    Database Template
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {templates.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <LayoutTemplate className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No templates yet</p>
            <p className="text-sm">
              Create a template to quickly scaffold new pages and databases
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => (
              <Card
                key={template.id}
                className="group hover:shadow-md transition-shadow cursor-pointer"
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">
                        {template.icon ||
                          (template.type === "DATABASE" ? "📊" : "📝")}
                      </span>
                      <CardTitle className="text-base">
                        {template.title}
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditing(template);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteTemplate.mutate(template.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                  {template.description && (
                    <CardDescription className="line-clamp-2">
                      {template.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => handleUseTemplate(template)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Use Template
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <button
                    className="text-3xl hover:bg-accent rounded p-1.5 transition-colors"
                    onClick={() => setShowIconPicker(!showIconPicker)}
                  >
                    {editIcon || (editingTemplate?.type === "DATABASE" ? "📊" : "📝")}
                  </button>
                  {showIconPicker && (
                    <EmojiPicker
                      onSelect={(icon) => {
                        setEditIcon(icon);
                        setShowIconPicker(false);
                      }}
                      onClose={() => setShowIconPicker(false)}
                    />
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <Label htmlFor="edit-title" className="text-xs">Title</Label>
                  <Input
                    id="edit-title"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Template name"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-desc">Description</Label>
                <Textarea
                  id="edit-desc"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="What is this template for?"
                  rows={3}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setEditingTemplate(null)}
                >
                  Cancel
                </Button>
                <Button
                  disabled={!editTitle.trim() || updateTemplate.isPending}
                  onClick={() => {
                    if (!editingTemplate) return;
                    updateTemplate.mutate({
                      id: editingTemplate.id,
                      title: editTitle.trim(),
                      description: editDescription.trim() || undefined,
                      icon: editIcon || undefined,
                    });
                  }}
                >
                  Save Changes
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

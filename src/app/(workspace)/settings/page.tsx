"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Plus, Trash2, Users } from "lucide-react";
import { useWorkspaceStore } from "@/hooks/use-workspace";
import { useMembers, type Member } from "@/hooks/use-members";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function SettingsPage() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"EDITOR" | "VIEWER">("EDITOR");

  const roleLabel = (role: string) =>
    ({ ADMIN: "Admin", EDITOR: "Editor", VIEWER: "Viewer" })[role] || role;

  const { data: members = [] } = useMembers();

  const currentUserId = session?.user?.id;
  const currentMember = members.find((m) => m.user.id === currentUserId);
  const isAdmin = currentMember?.role === "ADMIN";

  const invite = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, email: inviteEmail, role: inviteRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members"] });
      setInviteEmail("");
      toast.success("Member invited");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateRole = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
      const res = await fetch("/api/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, role }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members"] });
      toast.success("Role updated");
    },
  });

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const res = await fetch("/api/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members"] });
      toast.success("Member removed");
    },
  });

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to workspace
        </button>

        <h1 className="text-2xl font-bold mb-6">Workspace Settings</h1>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Team Members
            </CardTitle>
            <CardDescription>
              Manage who has access to this workspace
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isAdmin && (
              <>
                <div className="flex gap-2">
                  <Input
                    placeholder="colleague@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="flex-1"
                  />
                  <Select
                    value={inviteRole}
                    onValueChange={(v) => v && setInviteRole(v as "EDITOR" | "VIEWER")}
                  >
                    <SelectTrigger className="w-28">
                      {roleLabel(inviteRole)}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EDITOR">Editor</SelectItem>
                      <SelectItem value="VIEWER">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() => invite.mutate()}
                    disabled={!inviteEmail || invite.isPending}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Invite
                  </Button>
                </div>
                <Separator />
              </>
            )}

            <div className="space-y-3">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 py-2"
                >
                  <Avatar className="h-8 w-8">
                    {member.user.image && (
                      <AvatarImage src={member.user.image} alt={member.user.name || member.user.email} />
                    )}
                    <AvatarFallback className="text-xs">
                      {(member.user.name || member.user.email)
                        .slice(0, 2)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {member.user.name || member.user.email}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {member.user.email}
                    </p>
                  </div>
                  {isAdmin ? (
                    <>
                      <Select
                        value={member.role}
                        onValueChange={(role) =>
                          role && updateRole.mutate({ memberId: member.id, role })
                        }
                      >
                        <SelectTrigger className="w-24 h-8">
                          {roleLabel(member.role)}
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ADMIN">Admin</SelectItem>
                          <SelectItem value="EDITOR">Editor</SelectItem>
                          <SelectItem value="VIEWER">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => removeMember.mutate(member.id)}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </>
                  ) : (
                    <Badge variant="secondary">{roleLabel(member.role)}</Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

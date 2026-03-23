"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  AvatarGroup,
} from "@/components/ui/avatar";
import {
  usePageGuests,
  useAddPageGuest,
  useRemovePageGuest,
  type PageGuest,
} from "@/hooks/use-page-guests";
import {
  usePageShares,
  useAddPageShare,
  useRemovePageShare,
  useUpdatePageShare,
  type PageShare,
} from "@/hooks/use-page-shares";
import { useMembers, type Member } from "@/hooks/use-members";
import { useUpdatePage } from "@/hooks/use-pages";
import {
  Link,
  Copy,
  Check,
  X,
  Loader2,
  Globe,
  Lock,
  Users,
  Crown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ShareDialogProps {
  pageId: string;
  pageTitle: string;
  isPrivate?: boolean;
  createdBy?: string | null;
}

function getInitials(member: Member) {
  const name = member.user.name || member.user.email;
  return name.slice(0, 2).toUpperCase();
}

const MAX_AVATARS = 5;

export function ShareDialog({ pageId, pageTitle, isPrivate, createdBy }: ShareDialogProps) {
  const [open, setOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [guestPermission, setGuestPermission] = useState<"VIEWER" | "EDITOR">("VIEWER");
  const [linkCopied, setLinkCopied] = useState(false);
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;

  const { data: guests = [], isLoading: guestsLoading } = usePageGuests(pageId);
  const { data: shares = [], isLoading: sharesLoading } = usePageShares(pageId);
  const { data: members = [] } = useMembers();
  const addGuest = useAddPageGuest();
  const removeGuest = useRemovePageGuest();
  const addShare = useAddPageShare();
  const removeShare = useRemovePageShare();
  const updateShare = useUpdatePageShare();
  const updatePage = useUpdatePage();

  const sharedUserIds = useMemo(
    () => new Set(shares.map((s) => s.user_id)),
    [shares]
  );

  const availableMembers = useMemo(() => {
    const search = searchInput.toLowerCase().trim();
    return members.filter((m) => {
      if (m.user.id === createdBy) return false;
      if (sharedUserIds.has(m.user.id)) return false;
      if (!search) return false;
      return (
        m.user.email.toLowerCase().includes(search) ||
        (m.user.name || "").toLowerCase().includes(search)
      );
    });
  }, [members, sharedUserIds, createdBy, searchInput]);

  const isEmailInput = useMemo(() => {
    const trimmed = searchInput.trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  }, [searchInput]);

  const isExistingGuest = useMemo(() => {
    const email = searchInput.trim().toLowerCase();
    return guests.some((g) => g.email.toLowerCase() === email);
  }, [searchInput, guests]);

  const isExistingMember = useMemo(() => {
    const email = searchInput.trim().toLowerCase();
    return members.some((m) => m.user.email.toLowerCase() === email);
  }, [searchInput, members]);

  const showGuestInvite = isEmailInput && !isExistingGuest && !isExistingMember && searchInput.trim().length > 0;

  const isOwner = createdBy === currentUserId;
  const hasExplicitAccess = shares.length > 0 || guests.length > 0;
  const visiblePeople = isPrivate
    ? (() => {
        const owner = members.find((m) => m.user.id === createdBy);
        const sharedMembers = shares
          .map((s) => members.find((m) => m.user.id === s.user_id))
          .filter(Boolean) as Member[];
        const all = owner ? [owner, ...sharedMembers] : sharedMembers;
        return all.slice(0, MAX_AVATARS);
      })()
    : members.slice(0, MAX_AVATARS);

  const StatusIcon = isPrivate
    ? hasExplicitAccess ? Users : Lock
    : Globe;

  const statusLabel = isPrivate
    ? hasExplicitAccess ? "Shared" : "Private"
    : "Workspace";

  function handleInviteGuest() {
    const email = searchInput.trim();
    if (!email) return;

    addGuest.mutate(
      { pageId, email, permission: guestPermission },
      {
        onSuccess: () => {
          setSearchInput("");
          toast.success("Guest invited");
        },
        onError: (err) => toast.error(err.message),
      }
    );
  }

  function handleAddMember(userId: string) {
    addShare.mutate(
      { pageId, userId, permission: "VIEWER" },
      {
        onSuccess: () => {
          setSearchInput("");
          toast.success("Member added");
        },
        onError: (err) => toast.error(err.message),
      }
    );
  }

  function handleRemoveGuest(guestId: string) {
    removeGuest.mutate(
      { pageId, guestId },
      {
        onSuccess: () => toast.success("Guest removed"),
        onError: () => toast.error("Failed to remove guest"),
      }
    );
  }

  function handleRemoveShare(shareId: string) {
    removeShare.mutate(
      { pageId, shareId },
      {
        onSuccess: () => toast.success("Member removed"),
        onError: () => toast.error("Failed to remove member"),
      }
    );
  }

  function handleUpdateSharePermission(shareId: string, permission: "VIEWER" | "EDITOR") {
    updateShare.mutate(
      { pageId, shareId, permission },
      { onError: () => toast.error("Failed to update permission") }
    );
  }

  function handleCopyGuestLink(guest: PageGuest) {
    const url = `${window.location.origin}/guest/${guest.token}`;
    navigator.clipboard.writeText(url);
    toast.success("Guest link copied");
  }

  function handleCopyPageLink() {
    const url = `${window.location.origin}/${pageId}`;
    navigator.clipboard.writeText(url);
    setLinkCopied(true);
    toast.success("Link copied");
    setTimeout(() => setLinkCopied(false), 2000);
  }

  function handleToggleGeneralAccess() {
    updatePage.mutate(
      { pageId, isPrivate: !isPrivate },
      {
        onSuccess: () =>
          toast.success(isPrivate ? "Page visible to all workspace members" : "Page restricted to specific people"),
        onError: () => toast.error("Failed to update access"),
      }
    );
  }

  const ownerMember = members.find((m) => m.user.id === createdBy);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs transition-colors hover:bg-muted cursor-pointer" />
        }
      >
        {visiblePeople.length > 0 && (
          <AvatarGroup>
            {visiblePeople.map((member) => (
              <Avatar key={member.id} size="sm">
                {member.user.image && (
                  <AvatarImage src={member.user.image} />
                )}
                <AvatarFallback>{getInitials(member)}</AvatarFallback>
              </Avatar>
            ))}
          </AvatarGroup>
        )}
        <StatusIcon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium text-muted-foreground">{statusLabel}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0">
        {/* Add people / invite section */}
        <div className="px-3 pt-3 pb-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (showGuestInvite) handleInviteGuest();
            }}
            className="flex items-center gap-1.5"
          >
            <div className="relative flex-1">
              <Users className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Add people by name or email…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="h-8 pl-7 text-xs"
              />
            </div>
            {showGuestInvite && (
              <>
                <Select
                  value={guestPermission}
                  onValueChange={(val) => setGuestPermission(val as "VIEWER" | "EDITOR")}
                >
                  <SelectTrigger size="sm" className="h-8 w-[90px] text-xs">
                    {guestPermission === "EDITOR" ? "Can edit" : "Can view"}
                  </SelectTrigger>
                  <SelectContent className="min-w-[90px]" alignItemWithTrigger={false}>
                    <SelectItem value="VIEWER">Can view</SelectItem>
                    <SelectItem value="EDITOR">Can edit</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="submit"
                  size="sm"
                  className="h-8 text-xs px-3"
                  disabled={addGuest.isPending}
                >
                  {addGuest.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    "Invite"
                  )}
                </Button>
              </>
            )}
          </form>

          {availableMembers.length > 0 && (
            <div className="mt-1.5 max-h-32 overflow-y-auto rounded-md border bg-popover">
              {availableMembers.map((m) => (
                <button
                  key={m.user.id}
                  onClick={() => handleAddMember(m.user.id)}
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-xs hover:bg-accent transition-colors"
                >
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                    {(m.user.name || m.user.email).charAt(0).toUpperCase()}
                  </div>
                  <span className="truncate">
                    {m.user.name || m.user.email}
                  </span>
                  <span className="text-muted-foreground ml-auto truncate">
                    {m.user.name ? m.user.email : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* People with access */}
        <div className="border-t px-3 py-2">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            People with access
          </p>
          <div className="max-h-48 overflow-y-auto space-y-0.5 -mx-1.5">
            {/* Owner */}
            {ownerMember && (
              <div className="flex items-center gap-2 rounded-md px-1.5 py-1">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                  {(ownerMember.user.name || ownerMember.user.email).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs truncate">
                    {ownerMember.user.name || ownerMember.user.email}
                    {ownerMember.user.id === currentUserId && (
                      <span className="text-muted-foreground"> (you)</span>
                    )}
                  </p>
                </div>
                <Badge variant="outline" className="h-4 text-[9px] px-1.5 shrink-0 gap-0.5">
                  <Crown className="h-2.5 w-2.5" />
                  Owner
                </Badge>
              </div>
            )}

            {(sharesLoading || guestsLoading) && (
              <p className="text-xs text-muted-foreground text-center py-2">Loading…</p>
            )}

            {/* Shared workspace members */}
            {shares.map((share) => (
              <MemberShareRow
                key={share.id}
                share={share}
                currentUserId={currentUserId}
                onUpdatePermission={handleUpdateSharePermission}
                onRemove={handleRemoveShare}
                canManage={isOwner}
              />
            ))}

            {/* Guests */}
            {guests.map((guest) => (
              <GuestRow
                key={guest.id}
                guest={guest}
                onRemove={handleRemoveGuest}
                onCopyLink={handleCopyGuestLink}
                canManage={isOwner}
              />
            ))}
          </div>
        </div>

        {/* General access */}
        {isPrivate !== undefined && (
          <div className="border-t px-3 py-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
              General access
            </p>
            <div className="space-y-0.5">
              <button
                onClick={() => isPrivate && isOwner && handleToggleGeneralAccess()}
                disabled={!isOwner}
                className={cn(
                  "flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-xs transition-colors",
                  !isPrivate && "bg-accent",
                  isOwner ? "hover:bg-accent/80 cursor-pointer" : "opacity-60 cursor-default"
                )}
              >
                <div className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                  !isPrivate ? "bg-green-500/15 text-green-600" : "bg-muted text-muted-foreground"
                )}>
                  <Globe className="h-3 w-3" />
                </div>
                <div className="flex-1 text-left">
                  <p className={cn("font-medium", !isPrivate && "text-foreground")}>
                    Everyone in workspace
                  </p>
                </div>
                {!isPrivate && (
                  <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
                )}
              </button>
              <button
                onClick={() => !isPrivate && isOwner && handleToggleGeneralAccess()}
                disabled={!isOwner}
                className={cn(
                  "flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-xs transition-colors",
                  isPrivate && "bg-accent",
                  isOwner ? "hover:bg-accent/80 cursor-pointer" : "opacity-60 cursor-default"
                )}
              >
                <div className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                  isPrivate ? "bg-amber-500/15 text-amber-600" : "bg-muted text-muted-foreground"
                )}>
                  <Lock className="h-3 w-3" />
                </div>
                <div className="flex-1 text-left">
                  <p className={cn("font-medium", isPrivate && "text-foreground")}>
                    Only invited people
                  </p>
                </div>
                {isPrivate && (
                  <Check className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* Copy link */}
        <div className="border-t px-3 py-2">
          <button
            onClick={handleCopyPageLink}
            className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
          >
            {linkCopied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Link className="h-3.5 w-3.5" />
            )}
            <span>{linkCopied ? "Copied!" : "Copy page link"}</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MemberShareRow({
  share,
  currentUserId,
  onUpdatePermission,
  onRemove,
  canManage,
}: {
  share: PageShare;
  currentUserId?: string;
  onUpdatePermission: (shareId: string, permission: "VIEWER" | "EDITOR") => void;
  onRemove: (shareId: string) => void;
  canManage: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted/50 group">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
        {(share.user.name || share.user.email).charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs truncate">
          {share.user.name || share.user.email}
          {share.user_id === currentUserId && (
            <span className="text-muted-foreground"> (you)</span>
          )}
        </p>
      </div>
      {canManage ? (
        <>
          <Select
            value={share.permission}
            onValueChange={(val) =>
              onUpdatePermission(share.id, val as "VIEWER" | "EDITOR")
            }
          >
            <SelectTrigger size="sm" className="h-5 text-[9px] px-1.5 w-[72px]">
              {share.permission === "EDITOR" ? "Can edit" : "Can view"}
            </SelectTrigger>
            <SelectContent className="min-w-[100px]" alignItemWithTrigger={false}>
              <SelectItem value="VIEWER">Can view</SelectItem>
              <SelectItem value="EDITOR">Can edit</SelectItem>
            </SelectContent>
          </Select>
          <button
            onClick={() => onRemove(share.id)}
            className="hidden group-hover:block p-0.5 rounded hover:bg-muted text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </>
      ) : (
        <Badge variant="secondary" className="h-4 text-[9px] px-1.5 shrink-0">
          {share.permission === "EDITOR" ? "Edit" : "View"}
        </Badge>
      )}
    </div>
  );
}

function GuestRow({
  guest,
  onRemove,
  onCopyLink,
  canManage,
}: {
  guest: PageGuest;
  onRemove: (id: string) => void;
  onCopyLink: (guest: PageGuest) => void;
  canManage: boolean;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    onCopyLink(guest);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted/50 group">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-600 text-[10px] font-medium">
        {guest.email.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs truncate">{guest.email}</p>
      </div>
      <div className="flex items-center gap-1 group-hover:hidden">
        <Badge variant="outline" className="h-4 text-[9px] px-1.5 shrink-0">
          Guest
        </Badge>
        <Badge variant="secondary" className="h-4 text-[9px] px-1.5 shrink-0">
          {guest.permission === "EDITOR" ? "Edit" : "View"}
        </Badge>
      </div>
      <div className="hidden items-center gap-0.5 group-hover:flex">
        <Badge variant="outline" className="h-4 text-[9px] px-1.5 shrink-0">
          Guest
        </Badge>
        <button
          onClick={handleCopy}
          className="p-0.5 rounded hover:bg-muted"
        >
          {copied ? (
            <Check className="h-3 w-3 text-green-500" />
          ) : (
            <Copy className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
        {canManage && (
          <button
            onClick={() => onRemove(guest.id)}
            className="p-0.5 rounded hover:bg-muted text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

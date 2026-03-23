"use client";

import { Lock, Globe, Users, UserPlus } from "lucide-react";
import { useSession } from "next-auth/react";
import { useMembers, type Member } from "@/hooks/use-members";
import { usePageGuests } from "@/hooks/use-page-guests";
import { usePageShares } from "@/hooks/use-page-shares";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  AvatarGroup,
} from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AccessIndicatorProps {
  pageId: string;
  isPrivate: boolean;
  createdBy: string | null;
}

function getInitials(member: Member) {
  const name = member.user.name || member.user.email;
  return name.slice(0, 2).toUpperCase();
}

const MAX_AVATARS = 5;

export function AccessIndicator({ pageId, isPrivate, createdBy }: AccessIndicatorProps) {
  const { data: members = [] } = useMembers();
  const { data: guests = [] } = usePageGuests(pageId);
  const { data: shares = [] } = usePageShares(isPrivate ? pageId : null);

  const hasShares = shares.length > 0 || guests.length > 0;
  const isShared = isPrivate && hasShares;

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

  const tooltipLabel = isPrivate
    ? hasShares
      ? "Shared with specific people"
      : "Only you"
    : "Everyone in workspace";

  const StatusIcon = isPrivate
    ? hasShares ? Users : Lock
    : Globe;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={<div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-1.5 cursor-default" />}
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
          <span className="text-xs font-medium text-muted-foreground">
            {isPrivate ? (hasShares ? "Shared" : "Private") : "Workspace"}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex flex-col gap-0.5">
            <span className="font-medium flex items-center gap-1">
              <StatusIcon className="h-3 w-3" />
              {tooltipLabel}
            </span>
            {!isPrivate && (
              <span className="text-xs opacity-80">
                {members.length} member{members.length !== 1 && "s"} have access
              </span>
            )}
            {isShared && (
              <>
                {shares.length > 0 && (
                  <span className="text-xs opacity-80">
                    {shares.length + 1} member{shares.length > 0 && "s"} have access
                  </span>
                )}
                {guests.length > 0 && (
                  <span className="text-xs opacity-80 flex items-center gap-1">
                    <UserPlus className="h-2.5 w-2.5" />
                    {guests.length} guest{guests.length !== 1 && "s"}
                  </span>
                )}
              </>
            )}
            <span className="text-xs opacity-60 mt-0.5">
              Use Share to manage access
            </span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

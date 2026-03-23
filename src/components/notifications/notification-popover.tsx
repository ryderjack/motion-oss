"use client";

import { Bell, Check, CheckCheck, AtSign, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  useNotifications,
  useUnreadCount,
  useMarkAllNotificationsRead,
  type Notification,
} from "@/hooks/use-notifications";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function getInitials(actor: Notification["actor"]): string {
  const name = actor.name || actor.email;
  return name.slice(0, 2).toUpperCase();
}

interface NotificationPopoverProps {
  onNavigateToPage?: (pageId: string) => void;
  unreadCount?: number;
}

export function NotificationPopover({ onNavigateToPage, unreadCount: externalUnreadCount }: NotificationPopoverProps) {
  const { data: notifications = [], isLoading } = useNotifications();
  const internalUnreadCount = useUnreadCount();
  const unreadCount = externalUnreadCount ?? internalUnreadCount;
  const markAllRead = useMarkAllNotificationsRead();
  const queryClient = useQueryClient();

  function handleNotificationClick(notification: Notification) {
    if (!notification.is_read) {
      queryClient.setQueryData<Notification[]>(["notifications"], (old) =>
        old?.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
      );
      fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: notification.id }),
      });
    }
    if (notification.page_id && onNavigateToPage) {
      onNavigateToPage(notification.page_id);
    }
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground" />
        }
      >
        <Bell className="h-4 w-4" />
        <span>Notifications</span>
        {unreadCount > 0 && (
          <span className="ml-auto text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 min-w-5 text-center font-semibold">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" side="right" sideOffset={8} className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <span className="text-sm text-muted-foreground">Loading...</span>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Bell className="h-8 w-8 text-muted-foreground/40" />
              <span className="text-sm text-muted-foreground">
                No notifications yet
              </span>
              <span className="text-xs text-muted-foreground/60">
                Mention someone with @ to notify them
              </span>
            </div>
          ) : (
            <div>
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={cn(
                    "flex items-start gap-3 w-full px-4 py-3 text-left transition-colors hover:bg-accent/50",
                    !notification.is_read && "bg-primary/5"
                  )}
                >
                  <div className="relative shrink-0 mt-0.5">
                    <Avatar size="sm">
                      {notification.actor.image && (
                        <AvatarImage src={notification.actor.image} />
                      )}
                      <AvatarFallback>
                        {getInitials(notification.actor)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center h-3.5 w-3.5 rounded-full bg-primary text-primary-foreground">
                      {notification.type === "comment_mention" ? (
                        <MessageSquare className="h-2 w-2" />
                      ) : (
                        <AtSign className="h-2 w-2" />
                      )}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug">
                      <span className="font-medium">
                        {notification.actor.name || notification.actor.email}
                      </span>{" "}
                      <span className="text-muted-foreground">
                        {notification.content}
                      </span>
                    </p>
                    <span className="text-xs text-muted-foreground/70 mt-0.5 block">
                      {formatTimeAgo(notification.created_at)}
                    </span>
                  </div>
                  {!notification.is_read && (
                    <div className="shrink-0 mt-2">
                      <div className="h-2 w-2 rounded-full bg-primary" />
                    </div>
                  )}
                  {notification.is_read && (
                    <div className="shrink-0 mt-2">
                      <Check className="h-3 w-3 text-muted-foreground/40" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  Calendar,
  AlertTriangle,
  TrendingDown,
  ExternalLink,
  Loader2,
  Inbox,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import type { AppNotification } from "@/types";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface NotificationCenterProps {
  className?: string;
}

export function NotificationCenter({ className }: NotificationCenterProps) {
  const [open, setOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [tableExists, setTableExists] = React.useState<boolean | null>(null);

  // Fetch notifications for the authenticated user (used for manual refresh / retry / open)
  const fetchNotifications = React.useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setIsLoading(false);
        return;
      }

      // Query notifications table for authenticated user
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        // Table not migrated yet or schema cache missing
        if (
          error.code === "PGRST205" ||
          error.message?.includes("not find the table") ||
          error.message?.includes("schema cache")
        ) {
          setTableExists(false);
          setNotifications([]);
        } else {
          console.error("Error fetching notifications:", error);
          setErrorMessage("Could not load notifications.");
        }
        setIsLoading(false);
        return;
      }

      setTableExists(true);
      setNotifications(data || []);
    } catch (err) {
      console.error("Unexpected error in fetchNotifications:", err);
      setErrorMessage("An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch initial notifications on mount with cleanup
  React.useEffect(() => {
    let isCancelled = false;

    async function loadInitialNotifications() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (isCancelled) return;

        if (!user) {
          setIsLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from("notifications")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (isCancelled) return;

        if (error) {
          if (
            error.code === "PGRST205" ||
            error.message?.includes("not find the table") ||
            error.message?.includes("schema cache")
          ) {
            setTableExists(false);
            setNotifications([]);
          } else {
            console.error("Error fetching notifications on mount:", error);
            setErrorMessage("Could not load notifications.");
          }
          setIsLoading(false);
          return;
        }

        setTableExists(true);
        setNotifications(data || []);
      } catch (err) {
        if (!isCancelled) {
          console.error("Unexpected error loading notifications:", err);
          setErrorMessage("An unexpected error occurred.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    loadInitialNotifications();

    return () => {
      isCancelled = true;
    };
  }, []);

  // Subscribe to real-time notification inserts for the current user if table exists
  React.useEffect(() => {
    if (tableExists !== true) return;

    let isMounted = true;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function setupSubscription() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isMounted || !user) return;

      const channelName = `user-notifications-${user.id}`;

      // Remove any pre-existing channel for this topic to avoid duplicate subscriptions
      const existing = supabase
        .getChannels()
        .find(
          (c) =>
            c.topic === `realtime:${channelName}` || c.topic === channelName
        );
      if (existing) {
        await supabase.removeChannel(existing);
      }

      if (!isMounted) return;

      // Register all postgres_changes listeners before calling subscribe()
      const newChannel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const newNotif = payload.new as AppNotification;
            setNotifications((prev) => [newNotif, ...prev]);
            toast.info(`🔔 ${newNotif.title}`, {
              description: newNotif.message,
            });
          }
        );

      channel = newChannel;
      newChannel.subscribe();
    }

    setupSubscription();

    return () => {
      isMounted = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [tableExists]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Mark a single notification as read
  const handleMarkAsRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );

    if (tableExists) {
      try {
        const supabase = createClient();
        await supabase.rpc("mark_notifications_as_read", {
          p_notification_ids: [id],
        });
      } catch (err) {
        console.warn("Could not sync is_read state:", err);
      }
    }
  };

  // Mark all notifications as read
  const handleMarkAllAsRead = async () => {
    if (unreadCount === 0) return;

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));

    if (tableExists) {
      try {
        const supabase = createClient();
        await supabase.rpc("mark_notifications_as_read");
      } catch (err) {
        console.warn("Could not sync mark all as read:", err);
      }
    }

    toast.success("All notifications marked as read");
  };

  // Render notification icon based on type
  const renderIcon = (type: string) => {
    switch (type) {
      case "pool_joined":
        return <CheckCircle2 className="size-4 text-[#6B7F5B]" />;
      case "event_completed":
        return <Calendar className="size-4 text-[#6B7F5B]" />;
      case "event_cancelled":
        return <AlertTriangle className="size-4 text-red-600" />;
      case "price_drop":
        return <TrendingDown className="size-4 text-[#C96F4F]" />;
      default:
        return <Bell className="size-4 text-[#C96F4F]" />;
    }
  };

  // Format relative time safely
  const formatTimeAgo = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "Recently";
      return formatDistanceToNow(d, { addSuffix: true });
    } catch {
      return "Recently";
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        onClick={() => {
          setOpen(true);
          fetchNotifications();
        }}
        className={`relative rounded-full border-[#D9C9B2] bg-white text-[#2E3A2F] hover:bg-[#E8E3D6]/50 hover:text-[#2E3A2F] transition-all shadow-xs cursor-pointer ${
          className || ""
        }`}
        aria-label="View notifications"
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-[#C96F4F] text-[#F8F6EE] text-[9px] font-extrabold shadow-2xs">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md bg-white border-[#D9C9B2] rounded-2xl p-5 text-[#2E3A2F]">
          <DialogHeader className="gap-1 text-left pb-2 border-b border-[#D9C9B2]/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-xl bg-[#E8E3D6] border border-[#D9C9B2] flex items-center justify-center text-[#C96F4F]">
                  <Bell className="size-4" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-heading font-bold text-[#2E3A2F]">
                    Notifications
                  </DialogTitle>
                  <DialogDescription className="text-xs text-[#2E3A2F]/70">
                    Society updates and group booking alerts
                  </DialogDescription>
                </div>
              </div>

              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleMarkAllAsRead}
                  className="text-xs text-[#6B7F5B] hover:text-[#526245] hover:bg-[#E8E3D6]/50 h-8 px-2 flex items-center gap-1 cursor-pointer"
                >
                  <CheckCheck className="size-3.5" />
                  <span>Mark all read</span>
                </Button>
              )}
            </div>
          </DialogHeader>

          {/* Notifications List Container */}
          <div className="max-h-[60vh] overflow-y-auto space-y-2.5 py-2">
            {isLoading && (
              <div className="py-10 flex flex-col items-center justify-center text-center space-y-2">
                <Loader2 className="size-6 text-[#6B7F5B] animate-spin" />
                <p className="text-xs text-[#2E3A2F]/70">Loading notifications...</p>
              </div>
            )}

            {!isLoading && errorMessage && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0 text-red-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            {!isLoading && !errorMessage && notifications.length === 0 && (
              <div className="py-10 flex flex-col items-center justify-center text-center space-y-2">
                <div className="size-12 rounded-2xl bg-[#E8E3D6]/70 border border-[#D9C9B2] flex items-center justify-center text-[#6B7F5B]">
                  <Inbox className="size-6" />
                </div>
                <h4 className="font-heading font-semibold text-sm text-[#2E3A2F]">
                  All caught up!
                </h4>
                <p className="text-xs text-[#2E3A2F]/70 max-w-xs">
                  {tableExists === false
                    ? "No notifications yet. Notifications will appear here when you join pools or events update."
                    : "You have no active alerts. You will be notified when group booking rates change or events update."}
                </p>
              </div>
            )}

            {!isLoading &&
              !errorMessage &&
              notifications.map((notification) => {
                const isUnread = !notification.is_read;

                return (
                  <div
                    key={notification.id}
                    onClick={() => {
                      if (isUnread) handleMarkAsRead(notification.id);
                    }}
                    className={`p-3.5 rounded-xl border transition-all text-xs space-y-1.5 cursor-pointer ${
                      isUnread
                        ? "bg-[#F8F6EE] border-[#C4B196] shadow-2xs"
                        : "bg-white border-[#D9C9B2]/60 hover:bg-[#F8F6EE]/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 font-semibold text-[#2E3A2F]">
                        {renderIcon(notification.type)}
                        <span className="text-xs">{notification.title}</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-[#2E3A2F]/60">
                          {formatTimeAgo(notification.created_at)}
                        </span>
                        {isUnread && (
                          <span className="size-2 rounded-full bg-[#C96F4F]" />
                        )}
                      </div>
                    </div>

                    <p className="text-[#2E3A2F]/80 text-[11px] leading-relaxed">
                      {notification.message}
                    </p>

                    {notification.event_id && (
                      <div className="pt-1 flex items-center justify-between">
                        <Link
                          href={`/event/${notification.event_id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpen(false);
                            if (isUnread) handleMarkAsRead(notification.id);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#C96F4F] hover:underline"
                        >
                          <span>View Event</span>
                          <ExternalLink className="size-3" />
                        </Link>

                        {isUnread && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkAsRead(notification.id);
                            }}
                            className="text-[10px] text-[#6B7F5B] hover:underline font-medium"
                          >
                            Mark as read
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

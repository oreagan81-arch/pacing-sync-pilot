import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: "pending" | "deployed" | "failed" | "skipped";
}

const statusConfig = {
  pending: { label: "Pending", className: "bg-warning/15 text-warning border-warning/30" },
  deployed: { label: "Deployed", className: "bg-success/15 text-success border-success/30" },
  failed: { label: "Failed", className: "bg-destructive/15 text-destructive border-destructive/30" },
  skipped: { label: "Skipped", className: "bg-muted text-muted-foreground border-border" },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        config.className
      )}
    >
      <span
        className={cn("status-dot", {
          "bg-warning": status === "pending",
          "bg-success": status === "deployed",
          "bg-destructive": status === "failed",
          "bg-muted-foreground": status === "skipped",
        })}
      />
      {config.label}
    </span>
  );
}

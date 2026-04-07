import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle, AlertCircle } from "lucide-react";

interface RiskBadgeProps {
  level: "low" | "medium" | "high" | null;
}

export function RiskBadge({ level }: RiskBadgeProps) {
  if (!level) return null;

  const config = {
    low: { icon: CheckCircle, className: "text-risk-low", label: "Low" },
    medium: { icon: AlertTriangle, className: "text-risk-medium", label: "Med" },
    high: { icon: AlertCircle, className: "text-risk-high", label: "High" },
  };

  const { icon: Icon, className, label } = config[level];

  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", className)}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

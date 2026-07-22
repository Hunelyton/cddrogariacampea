import { ReactNode, memo } from "react";
import { Card } from "@/components/ui/card";

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  subtitle: string;
  variant?: "blue" | "warning" | "success" | "destructive";
  valueColor?: string;
  secondaryValue?: string | number;
  secondaryLabel?: string;
}

const bgColors = {
  blue: "bg-stat-blue",
  warning: "bg-warning-orange",
  success: "bg-success-green",
  destructive: "bg-destructive/10",
};

const iconBgColors = {
  blue: "bg-stat-blue-icon",
  warning: "bg-warning-orange",
  success: "bg-success-green",
  destructive: "bg-destructive/20",
};

export const StatCard = memo(({ 
  icon, 
  label, 
  value, 
  subtitle, 
  variant = "blue",
  valueColor = "text-foreground",
  secondaryValue,
  secondaryLabel
}: StatCardProps) => {
  return (
    <Card className={`${bgColors[variant]} border-none shadow-sm p-6 transition-all hover:shadow-md`}>
      <div className="flex items-start gap-4">
        <div className={`${iconBgColors[variant]} p-3 rounded-lg flex-shrink-0`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            {label}
          </p>
          <div className="flex items-baseline gap-3">
            <p className={`text-3xl font-bold ${valueColor} mb-1`}>
              {value}
            </p>
            {secondaryValue !== undefined && (
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-semibold text-muted-foreground">+</span>
                <p className={`text-2xl font-bold ${valueColor}`}>
                  {secondaryValue}
                </p>
                {secondaryLabel && (
                  <span className="text-xs text-muted-foreground ml-1">
                    {secondaryLabel}
                  </span>
                )}
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {subtitle}
          </p>
        </div>
      </div>
    </Card>
  );
});

StatCard.displayName = "StatCard";

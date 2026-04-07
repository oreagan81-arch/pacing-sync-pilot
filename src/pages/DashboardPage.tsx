import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MOCK_PACING_DATA, evaluateRisk } from "@/data/mockPacing";
import { RiskBadge } from "@/components/RiskBadge";
import {
  TableProperties,
  Rocket,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function DashboardPage() {
  const navigate = useNavigate();
  const risk = evaluateRisk(MOCK_PACING_DATA);
  const deployed = MOCK_PACING_DATA.filter((r) => r.deployed_status === "deployed").length;
  const pending = MOCK_PACING_DATA.filter((r) => r.deployed_status === "pending").length;
  const failed = MOCK_PACING_DATA.filter((r) => r.deployed_status === "failed").length;

  const stats = [
    { label: "Total Items", value: MOCK_PACING_DATA.length, icon: TableProperties, color: "text-primary" },
    { label: "Deployed", value: deployed, icon: CheckCircle2, color: "text-success" },
    { label: "Pending", value: pending, icon: Clock, color: "text-warning" },
    { label: "Failed", value: failed, icon: XCircle, color: "text-destructive" },
  ];

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Command Center</h1>
          <p className="text-muted-foreground mt-1">
            Week 18 — Thales Academic OS
          </p>
        </div>
        <Button variant="deploy" size="lg" onClick={() => navigate("/pacing")} className="gap-2">
          <Rocket className="h-4 w-4" />
          Deploy to Canvas
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="glass">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4" />
              Risk Assessment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <RiskBadge level={risk.level} />
              <span className="text-sm text-muted-foreground">
                Score: {risk.score}
              </span>
            </div>
            {risk.issues.length > 0 ? (
              <ul className="space-y-1.5">
                {risk.issues.map((issue, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-warning mt-0.5">\u2022</span>
                    {issue}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-success">All systems nominal.</p>
            )}
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base">Course Routing</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {[
                { name: "Math", id: 21957 },
                { name: "LA", id: 21944 },
                { name: "Reading/Spelling", id: 21919 },
                { name: "History", id: 21934 },
                { name: "Science", id: 21970 },
                { name: "Homeroom", id: 22254 },
              ].map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                  <span className="font-medium">{c.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{c.id}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

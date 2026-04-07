import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, CheckCircle2, AlertTriangle, XCircle, Wifi } from "lucide-react";

const healthChecks = [
  { name: "Canvas API", status: "online", latency: "120ms" },
  { name: "Supabase DB", status: "online", latency: "45ms" },
  { name: "Gemini Vision", status: "online", latency: "890ms" },
  { name: "PDF Processor", status: "degraded", latency: "2100ms" },
  { name: "Calendar Sync", status: "online", latency: "200ms" },
];

const statusIcon = (status: string) => {
  switch (status) {
    case "online":
      return <CheckCircle2 className="h-4 w-4 text-success" />;
    case "degraded":
      return <AlertTriangle className="h-4 w-4 text-warning" />;
    default:
      return <XCircle className="h-4 w-4 text-destructive" />;
  }
};

export default function HealthMonitorPage() {
  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI Health Monitor</h1>
        <p className="text-muted-foreground mt-1">
          Real-time system status &amp; diagnostics
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {healthChecks.map((check) => (
          <Card key={check.name} className="glass">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Wifi className="h-3.5 w-3.5 text-muted-foreground" />
                  {check.name}
                </span>
                {statusIcon(check.status)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-xs capitalize text-muted-foreground">
                  {check.status}
                </span>
                <span className="text-xs font-mono text-muted-foreground">
                  {check.latency}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Deployment Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 font-mono text-xs">
            {[
              { time: "10:42:15", msg: "Canvas PUT /courses/21957/pages/week-18-agenda — 200 OK" },
              { time: "10:42:14", msg: "Front page check GET — front_page: false — safe to update" },
              { time: "10:42:12", msg: "Assignment created: Math Lesson 78 Odds — ID canvas_78001" },
              { time: "10:42:10", msg: "Risk assessment: score 25 (medium) — proceeding" },
              { time: "10:42:08", msg: "Deployment initiated for Week 18 — 5 items queued" },
            ].map((log, i) => (
              <div key={i} className="flex gap-3 text-muted-foreground">
                <span className="text-primary shrink-0">{log.time}</span>
                <span>{log.msg}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

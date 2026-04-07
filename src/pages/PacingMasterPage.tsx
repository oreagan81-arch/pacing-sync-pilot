import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { RiskBadge } from "@/components/RiskBadge";
import { MOCK_PACING_DATA, evaluateRisk } from "@/data/mockPacing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Rocket, Download, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";

export default function PacingMasterPage() {
  const [deploying, setDeploying] = useState(false);
  const risk = evaluateRisk(MOCK_PACING_DATA);

  const handleDeploy = () => {
    setDeploying(true);
    toast.info("Evaluating risk assessment...");
    setTimeout(() => {
      if (risk.level === "high") {
        toast.warning("High risk detected — review issues before deploying.", {
          description: risk.issues.join("; "),
        });
      } else {
        toast.success("Deployment initiated for pending items.");
      }
      setDeploying(false);
    }, 1500);
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pacing Master</h1>
          <p className="text-muted-foreground mt-1">
            {MOCK_PACING_DATA.length} entries &middot; Week 18
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
          <Button variant="outline" size="sm" className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            Sync
          </Button>
          <Button
            variant="deploy"
            size="sm"
            className="gap-2"
            onClick={handleDeploy}
            disabled={deploying}
          >
            <Rocket className="h-3.5 w-3.5" />
            {deploying ? "Deploying..." : "Deploy to Canvas"}
          </Button>
        </div>
      </div>

      <Card className="glass overflow-hidden">
        <CardHeader className="py-3 px-4 border-b border-border">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Data Grid</CardTitle>
            <RiskBadge level={risk.level} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-12 font-mono text-xs">Wk</TableHead>
                  <TableHead className="font-mono text-xs">Date</TableHead>
                  <TableHead className="font-mono text-xs">Day</TableHead>
                  <TableHead className="font-mono text-xs">Subject</TableHead>
                  <TableHead className="font-mono text-xs">L#</TableHead>
                  <TableHead className="font-mono text-xs">Title</TableHead>
                  <TableHead className="font-mono text-xs">Type</TableHead>
                  <TableHead className="font-mono text-xs text-center">Assign</TableHead>
                  <TableHead className="font-mono text-xs text-center">Announce</TableHead>
                  <TableHead className="font-mono text-xs">Group</TableHead>
                  <TableHead className="font-mono text-xs text-right">Pts</TableHead>
                  <TableHead className="font-mono text-xs">Risk</TableHead>
                  <TableHead className="font-mono text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MOCK_PACING_DATA.map((row) => (
                  <TableRow key={row.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-mono text-xs">{row.week}</TableCell>
                    <TableCell className="font-mono text-xs">{row.date}</TableCell>
                    <TableCell className="text-xs">{row.day}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs font-medium">
                        {row.subject}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.lesson_num}</TableCell>
                    <TableCell className="text-xs max-w-[140px] truncate">{row.lesson_title}</TableCell>
                    <TableCell className="text-xs">{row.type}</TableCell>
                    <TableCell className="text-center text-xs">
                      {row.create_assign ? "\u2705" : "\u2014"}
                    </TableCell>
                    <TableCell className="text-center text-xs">
                      {row.create_announce ? "\u2705" : "\u2014"}
                    </TableCell>
                    <TableCell className="text-xs max-w-[120px] truncate">
                      {row.assignment_group || "\u2014"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-right">
                      {row.points ?? "\u2014"}
                    </TableCell>
                    <TableCell>
                      <RiskBadge level={row.risk_tag} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={row.deployed_status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

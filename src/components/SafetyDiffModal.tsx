import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { useState } from 'react';

interface SafetyDiffModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: string;
  week: number;
  action: 'DEPLOY_AGENDAS' | 'DEPLOY_ASSIGNMENTS';
  itemCount: number;
  items: { label: string; subject: string }[];
  onApprove: () => Promise<void>;
}

export default function SafetyDiffModal({
  open,
  onOpenChange,
  month,
  week,
  action,
  itemCount,
  items,
  onApprove,
}: SafetyDiffModalProps) {
  const [executing, setExecuting] = useState(false);

  const handleApprove = async () => {
    setExecuting(true);
    await onApprove();
    setExecuting(false);
    onOpenChange(false);
  };

  const actionLabel = action === 'DEPLOY_AGENDAS' ? 'Agenda Pages' : 'Assignments';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-warning" />
            Safety Diff — Confirm Deployment
          </DialogTitle>
          <DialogDescription>
            Review the following changes before executing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-muted p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Target</span>
              <span className="font-semibold">{month} Week {week}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Action</span>
              <Badge variant="outline" className="text-xs">{actionLabel}</Badge>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total items to sync</span>
              <span className="font-bold text-primary">{itemCount}</span>
            </div>
          </div>

          {items.length > 0 && (
            <div className="max-h-48 overflow-auto rounded-lg border p-3 space-y-1">
              {items.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <Badge className="text-[9px] bg-primary/10 text-primary border-primary/20" variant="outline">
                    {item.subject}
                  </Badge>
                  <span className="text-foreground">{item.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={executing}>
            Cancel
          </Button>
          <Button onClick={handleApprove} disabled={executing} className="gap-1.5 bg-success hover:bg-success/90 text-success-foreground">
            {executing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Approve & Execute Sync
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

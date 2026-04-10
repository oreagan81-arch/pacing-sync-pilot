import { useConfig } from '@/lib/config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SettingsPage() {
  const config = useConfig();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Canvas Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm">
            <span className="text-muted-foreground">Base URL: </span>
            <span className="font-mono text-xs">{config?.canvasBaseUrl}</span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Course IDs: </span>
            <pre className="text-xs font-mono mt-1 bg-muted p-3 rounded-lg overflow-auto">
              {JSON.stringify(config?.courseIds, null, 2)}
            </pre>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">App Info</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Thales Academic OS v14.1.0</p>
        </CardContent>
      </Card>
    </div>
  );
}

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Megaphone, Clock, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const mockAnnouncements = [
  {
    id: 1,
    subject: "Math",
    title: "Math Test 80 — 1 Week Reminder",
    body: "Math Test 80 is next Wednesday. Study Lesson 76–80. Download study guide.",
    scheduled: "Friday 4:00 PM",
    type: "test_reminder",
  },
  {
    id: 2,
    subject: "Reading",
    title: "Reading Test — Fluency Reminder",
    body: "Remember: tracking and tapping, 100 words per minute. Practice daily.",
    scheduled: "Friday 4:00 PM",
    type: "test_reminder",
  },
  {
    id: 3,
    subject: "Spelling",
    title: "Spelling Test 18 — Words 21–25",
    body: "Study words 21–25 from your cumulative word bank. Quiz on Friday.",
    scheduled: "Friday 4:00 PM",
    type: "test_reminder",
  },
];

export default function AnnouncementCenterPage() {
  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Announcement Center</h1>
        <p className="text-muted-foreground mt-1">
          Friday 4:00 PM auto-queued announcements
        </p>
      </div>

      <div className="grid gap-4">
        {mockAnnouncements.map((ann) => (
          <Card key={ann.id} className="glass">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Megaphone className="h-4 w-4 text-primary" />
                  {ann.title}
                </CardTitle>
                <Badge variant="outline" className="text-xs">
                  {ann.subject}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{ann.body}</p>
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {ann.scheduled}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Auto-queued
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

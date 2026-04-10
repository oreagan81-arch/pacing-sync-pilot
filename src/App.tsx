import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ConfigContext, loadConfig, type AppConfig } from '@/lib/config';
import { useEffect, useState } from 'react';

import PacingEntryPage from '@/pages/PacingEntryPage';
import PageBuilderPage from '@/pages/PageBuilderPage';
import AssignmentsPage from '@/pages/AssignmentsPage';
import AnnouncementCenterPage from '@/pages/AnnouncementCenterPage';
import NewsletterPage from '@/pages/NewsletterPage';
import FileOrganizerPage from '@/pages/FileOrganizerPage';
import HealthMonitorPage from '@/pages/HealthMonitorPage';
import SettingsPage from '@/pages/SettingsPage';
import NotFound from '@/pages/NotFound';

const queryClient = new QueryClient();

// Quarter color map (hex for inline styles)
const QUARTER_HEX: Record<string, string> = {
  Q1: '#00c0a5',
  Q2: '#0065a7',
  Q3: '#6644bb',
  Q4: '#c87800',
};

function AppContent({ config }: { config: AppConfig }) {
  const [activeQuarter, setActiveQuarter] = useState('Q3');
  const [activeWeek, setActiveWeek] = useState(1);
  const [riskLevel, setRiskLevel] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('LOW');
  const [riskScore, setRiskScore] = useState(100);

  const quarterColor = QUARTER_HEX[activeQuarter] || QUARTER_HEX.Q2;

  return (
    <BrowserRouter>
      <DashboardLayout
        activeQuarter={activeQuarter}
        activeWeek={activeWeek}
        riskLevel={riskLevel}
        riskScore={riskScore}
        quarterColor={quarterColor}
      >
        <Routes>
          <Route
            path="/"
            element={
              <PacingEntryPage
                activeQuarter={activeQuarter}
                setActiveQuarter={setActiveQuarter}
                activeWeek={activeWeek}
                setActiveWeek={setActiveWeek}
                setRiskLevel={setRiskLevel}
                setRiskScore={setRiskScore}
                quarterColor={quarterColor}
              />
            }
          />
          <Route path="/pages" element={<PageBuilderPage />} />
          <Route path="/assignments" element={<AssignmentsPage />} />
          <Route path="/announcements" element={<AnnouncementCenterPage />} />
          <Route path="/newsletter" element={<NewsletterPage />} />
          <Route path="/files" element={<FileOrganizerPage />} />
          <Route path="/health" element={<HealthMonitorPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </DashboardLayout>
    </BrowserRouter>
  );
}

const App = () => {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadConfig()
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <p className="text-destructive font-semibold">Failed to load config</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            onClick={() => {
              setError(null);
              loadConfig().then(setConfig).catch((e) => setError(e.message));
            }}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ConfigContext.Provider value={config}>
          <Toaster />
          <Sonner />
          <AppContent config={config} />
        </ConfigContext.Provider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;

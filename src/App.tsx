import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardLayout } from "@/components/DashboardLayout";
import DashboardPage from "@/pages/DashboardPage";
import PacingMasterPage from "@/pages/PacingMasterPage";
import ContentOrganizerPage from "@/pages/ContentOrganizerPage";
import AnnouncementCenterPage from "@/pages/AnnouncementCenterPage";
import HealthMonitorPage from "@/pages/HealthMonitorPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <DashboardLayout>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/pacing" element={<PacingMasterPage />} />
            <Route path="/content" element={<ContentOrganizerPage />} />
            <Route path="/announcements" element={<AnnouncementCenterPage />} />
            <Route path="/health" element={<HealthMonitorPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </DashboardLayout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

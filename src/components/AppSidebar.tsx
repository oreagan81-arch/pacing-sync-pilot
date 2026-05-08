import {
  Database,
  Globe,
  ClipboardList,
  Megaphone,
  Mail,
  FolderSearch,
  Activity,
  Settings,
  LayoutDashboard,
  Eye,
  ShieldCheck,
  Library,
  Brain,
  Zap,
  ClipboardCheck,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';

const navItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Pacing Entry', url: '/pacing', icon: Database },
  { title: 'Pacing Viewer', url: '/pacing-viewer', icon: Eye },
  { title: 'Page Builder', url: '/pages', icon: Globe },
  { title: 'Assignments', url: '/assignments', icon: ShieldCheck },
  { title: 'Announcements', url: '/announcements', icon: Megaphone },
  { title: 'Newsletter', url: '/newsletter', icon: Mail },
  { title: 'File Organizer', url: '/files', icon: FolderSearch },
  { title: 'Content Registry', url: '/content-registry', icon: Library },
  { title: 'Health Monitor', url: '/health', icon: Activity },
  { title: 'Memory', url: '/memory', icon: Brain },
  { title: 'Canvas Brain', url: '/canvas-brain', icon: Brain },
  { title: 'Automation', url: '/automation', icon: Zap },
  { title: 'Settings', url: '/settings', icon: Settings },
];

const diagnosticsItems = [
  { title: 'Canvas Auditor', url: '/canvas-auditor', icon: ClipboardCheck },
];

interface AppSidebarProps {
  activeQuarter: string;
  activeWeek: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  riskScore: number;
  quarterColor: string;
}

export function AppSidebar({
  activeQuarter,
  activeWeek,
  riskLevel,
  riskScore,
  quarterColor,
}: AppSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();

  const riskColorClass =
    riskLevel === 'HIGH'
      ? 'bg-destructive text-destructive-foreground'
      : riskLevel === 'MEDIUM'
        ? 'bg-warning text-warning-foreground'
        : 'bg-success text-success-foreground';

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: quarterColor }}
          >
            <Activity className="h-4 w-4 text-white" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-extrabold text-sidebar-primary-foreground tracking-tight">
                Thales OS
              </span>
              <span className="text-[10px] text-sidebar-foreground/60">
                v21.0 Command Center
              </span>
            </div>
          )}
        </div>
        {!collapsed && (
          <div className="flex gap-2 mt-3">
            <Badge
              className="text-[10px] px-2 py-0.5 rounded-full text-white border-0"
              style={{ backgroundColor: quarterColor }}
            >
              {activeQuarter}
            </Badge>
            <Badge variant="outline" className="text-[10px] px-2 py-0.5 rounded-full text-sidebar-foreground/70">
              Week {activeWeek}
            </Badge>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 text-[10px] uppercase tracking-wider">
            Modules
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === '/'}
                      className="hover:bg-sidebar-accent/50 transition-colors"
                      activeClassName="text-white font-semibold"
                      style={
                        location.pathname === item.url ||
                        (item.url === '/' && location.pathname === '/')
                          ? { backgroundColor: quarterColor }
                          : undefined
                      }
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 text-[10px] uppercase tracking-wider">
            Diagnostics
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {diagnosticsItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className="hover:bg-sidebar-accent/50 transition-colors"
                      activeClassName="text-white font-semibold"
                      style={
                        location.pathname === item.url
                          ? { backgroundColor: quarterColor }
                          : undefined
                      }
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4 space-y-3">
        {!collapsed && (
          <>
            <div className={`rounded-lg p-3 ${riskColorClass}`}>
              <div className="text-[10px] uppercase tracking-wider font-semibold opacity-80">
                Risk Score
              </div>
              <div className="text-xl font-extrabold">{riskScore}</div>
              <div className="text-[10px] font-semibold">{riskLevel}</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-bold text-sidebar-foreground">
                OR
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-sidebar-foreground">
                  Mr. Reagan
                </span>
                <span className="text-[10px] text-sidebar-foreground/60">
                  Grade 4A
                </span>
              </div>
            </div>
          </>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

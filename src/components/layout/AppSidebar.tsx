import { useAuth } from "@/hooks/useAuth";
import { useMyTeams } from "@/hooks/useTeams";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Users,
  Baby,
  Music,
  Monitor,
  Coffee,
  HandHelping,
  Sparkles,
  LogOut,
  LayoutDashboard,
  Shield,
  User,
  MessageSquare,
  ChevronDown,
  UserCheck,
  UsersRound,
  CalendarDays,
  BookOpen,
  Mail,
  MessageCircle,
  Inbox,
  ClipboardCheck,
  Heart,
  Network,
  Upload,
  HelpCircle,
} from "lucide-react";

const teamIcons: Record<string, React.ElementType> = {
  "childrens-ministry": Baby,
  worship: Music,
  "media-production": Monitor,
  "java-team": Coffee,
  ushers: HandHelping,
  "first-impressions": Sparkles,
};

const adminSubItems = [
  { label: "Volunteers", value: "volunteers", icon: UserCheck },
  { label: "Teams", value: "teams", icon: UsersRound },
  { label: "Roster", value: "roster", icon: CalendarDays },
  { label: "Attendance", value: "attendance", icon: ClipboardCheck },
  { label: "Groups", value: "groups", icon: Network },
  { label: "Inreach", value: "inreach", icon: Heart },
  { label: "Directory", value: "directory", icon: BookOpen },
  { label: "Org Chart", value: "organogram", icon: Network },
  { label: "Communications", value: "communications", icon: Mail },
  { label: "Feedback", value: "feedback", icon: MessageCircle },
  { label: "Requests", value: "requests", icon: Inbox },
  { label: "Import", value: "import", icon: Upload },
];

export function AppSidebar() {
  const { user, isAdmin, signOut } = useAuth();
  const { data: memberships } = useMyTeams();
  const location = useLocation();
  const navigate = useNavigate();

  const profile = user?.email ?? "";
  const isOnAdmin = location.pathname.startsWith("/admin");

  // Extract active tab from URL search params
  const searchParams = new URLSearchParams(location.search);
  const activeTab = searchParams.get("tab") || "volunteers";

  const handleAdminTab = (tab: string) => {
    navigate(`/admin?tab=${tab}`);
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar-primary">
            <Users className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-display font-semibold text-sidebar-foreground">
              HOTC Volunteers
            </span>
            <span className="text-xs text-sidebar-foreground/60 truncate max-w-[160px]">
              {profile}
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <Collapsible defaultOpen={isOnAdmin} className="group/collapsible">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton className={isOnAdmin ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""}>
                        <Shield className="h-4 w-4" />
                        <span>Admin Panel</span>
                        <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {adminSubItems.map((item) => (
                          <SidebarMenuSubItem key={item.value}>
                            <SidebarMenuSubButton
                              onClick={() => handleAdminTab(item.value)}
                              isActive={isOnAdmin && activeTab === item.value}
                              className="cursor-pointer"
                            >
                              <item.icon className="h-3.5 w-3.5" />
                              <span>{item.label}</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel>My Teams</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {memberships?.map((m) => {
                const Icon = teamIcons[m.teams.slug] || LayoutDashboard;
                return (
                  <SidebarMenuItem key={m.team_id}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={`/team/${m.teams.slug}`}
                        activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
                      >
                        <Icon className="h-4 w-4" />
                        <span>{m.teams.name}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              {(!memberships || memberships.length === 0) && (
                <p className="px-3 py-2 text-xs text-sidebar-foreground/50">
                  No team assignments yet
                </p>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <NavLink to="/org-chart" activeClassName="bg-sidebar-accent text-sidebar-accent-foreground">
                <Network className="h-4 w-4" />
                <span>Org Chart</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <NavLink to="/feedback" activeClassName="bg-sidebar-accent text-sidebar-accent-foreground">
                <MessageSquare className="h-4 w-4" />
                <span>Feedback</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <NavLink to="/profile" activeClassName="bg-sidebar-accent text-sidebar-accent-foreground">
                <User className="h-4 w-4" />
                <span>My Profile</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <NavLink to="/help" activeClassName="bg-sidebar-accent text-sidebar-accent-foreground">
                <HelpCircle className="h-4 w-4" />
                <span>Help & Docs</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} className="text-sidebar-foreground/70 hover:text-sidebar-foreground">
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

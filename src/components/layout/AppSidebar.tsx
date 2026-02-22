import { useAuth } from "@/hooks/useAuth";
import { useMyTeams } from "@/hooks/useTeams";
import { NavLink } from "@/components/NavLink";
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
} from "@/components/ui/sidebar";
import {
  Users,
  Settings,
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
} from "lucide-react";

const teamIcons: Record<string, React.ElementType> = {
  "childrens-ministry": Baby,
  worship: Music,
  "media-production": Monitor,
  "java-team": Coffee,
  ushers: HandHelping,
  "first-impressions": Sparkles,
};

export function AppSidebar() {
  const { user, isAdmin, signOut } = useAuth();
  const { data: memberships } = useMyTeams();

  const profile = user?.email ?? "";

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
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/admin" activeClassName="bg-sidebar-accent text-sidebar-accent-foreground">
                      <Shield className="h-4 w-4" />
                      <span>Admin Panel</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
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
              <NavLink to="/profile" activeClassName="bg-sidebar-accent text-sidebar-accent-foreground">
                <User className="h-4 w-4" />
                <span>My Profile</span>
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

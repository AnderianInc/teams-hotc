import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ProtectedRoute, AdminRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import Login from "@/pages/Login";
import ResetPassword from "@/pages/ResetPassword";
import CompleteProfile from "@/pages/CompleteProfile";
import Welcome from "@/pages/Welcome";
import Dashboard from "@/pages/Dashboard";
import TeamDashboard from "@/pages/TeamDashboard";
import AdminPanel from "@/pages/AdminPanel";
import DirectoryEntryDetail from "@/pages/DirectoryEntryDetail";
import FamilyDetail from "@/pages/FamilyDetail";
import Profile from "@/pages/Profile";
import Feedback from "@/pages/Feedback";
import NotFound from "@/pages/NotFound";
import CheckIn from "@/pages/CheckIn";
import Landing from "@/pages/Landing";
import OrgChart from "@/pages/OrgChart";
import SmsPolicy from "@/pages/SmsPolicy";
import ProofOfConsent from "@/pages/ProofOfConsent";
import { useEffect } from "react";
import { loadChurchTimezone } from "@/lib/timezone";

const queryClient = new QueryClient();

function RootRoute() {
  const { session, isLoading } = useAuth();
  useEffect(() => {
    // Warm the church timezone cache so non-React date formatters use it.
    loadChurchTimezone().catch(() => { /* fall back to default */ });
  }, []);
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!session) return <Landing />;
  return <Navigate to="/dashboard" replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/landing" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/complete-profile" element={<CompleteProfile />} />
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/check-in" element={<CheckIn />} />
            <Route path="/sms-policy" element={<SmsPolicy />} />
            <Route path="/messaging-terms" element={<SmsPolicy />} />
            <Route path="/proof-of-consent" element={<ProofOfConsent />} />
            <Route path="/sms-consent" element={<ProofOfConsent />} />
            <Route path="/" element={<RootRoute />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/feedback" element={<Feedback />} />
              <Route path="/org-chart" element={<OrgChart />} />
              <Route path="/team/:slug" element={<TeamDashboard />} />
              <Route path="/team/:slug" element={<TeamDashboard />} />
              <Route
                path="/admin"
                element={
                  <AdminRoute>
                    <AdminPanel />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/directory/family/:id"
                element={
                  <AdminRoute>
                    <FamilyDetail />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/directory/:id"
                element={
                  <AdminRoute>
                    <DirectoryEntryDetail />
                  </AdminRoute>
                }
              />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

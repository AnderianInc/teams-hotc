import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Smartphone, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

export default function WelcomeDevices({ attendeeId, userId, enabled }: { attendeeId?: string; userId?: string; enabled: boolean }) {
  const { isAdmin } = useAuth();
  const client = useQueryClient();
  const [revoking, setRevoking] = useState(false);
  const queryKey = ['welcome-devices', attendeeId, userId];
  const args = { _attendee_id: attendeeId || null, _user_id: userId || null };
  const { data: count, isLoading, error } = useQuery({
    queryKey,
    enabled: enabled && isAdmin && !!(attendeeId || userId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('manage_welcome_devices', args);
      if (error) throw error;
      return data;
    },
  });
  if (!isAdmin) return null;

  const revoke = async () => {
    if (!window.confirm('Reset all remembered devices for this person? They will need to use their mobile number again. Their account and attendance will not change.')) return;
    setRevoking(true);
    try {
      const { data, error } = await supabase.rpc('manage_welcome_devices', { ...args, _revoke: true });
      if (error) throw error;
      await client.invalidateQueries({ queryKey });
      toast.success(`Reset ${data} remembered device${data === 1 ? '' : 's'}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to reset devices');
    } finally { setRevoking(false); }
  };

  return <section className="space-y-2 border-t pt-3">
    <div className="flex items-center gap-2 text-sm font-medium"><Smartphone className="h-4 w-4" />Welcome check-in devices</div>
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <p className="text-sm text-muted-foreground" role="status">{error ? 'Unable to load remembered devices' : isLoading ? 'Loading…' : `${count ?? 0} remembered device${count === 1 ? '' : 's'}`}</p>
      <Button type="button" size="sm" variant="outline" onClick={revoke} disabled={revoking || isLoading || !!error || !count}>
        <RotateCcw className="h-4 w-4 mr-2" />{revoking ? 'Resetting…' : 'Reset all devices'}
      </Button>
    </div>
  </section>;
}
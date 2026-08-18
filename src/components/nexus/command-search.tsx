'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/database.types';
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem
} from '@/components/ui/command';
import { Search, User, Users, Hash } from 'lucide-react';
import { useUIStore } from '@/lib/stores/ui-store';
import { toast } from 'sonner';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Community = Database['public']['Tables']['communities']['Row'];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandSearch({ open, onOpenChange }: Props) {
  const { user } = useAuthStore();
  const { setActiveConversation, setActiveView, setMobileTab } = useUIStore();
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<Profile[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);

  const search = useCallback(async () => {
    if (!query || query.length < 2) { setUsers([]); setCommunities([]); return; }
    const supabase = createClient();
    const [u, c] = await Promise.all([
      supabase.from('profiles')
        .select('*')
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .neq('id', user?.id || '')
        .limit(5),
      supabase.from('communities')
        .select('*')
        .or(`name.ilike.%${query}%,slug.ilike.%${query}%`)
        .limit(5),
    ]);
    setUsers(u.data || []);
    setCommunities(c.data || []);
  }, [query, user]);

  useEffect(() => {
    const t = setTimeout(search, 200);
    return () => clearTimeout(t);
  }, [search]);

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onOpenChange]);

  const startDm = async (p: Profile) => {
    if (!user) return;
    const supabase = createClient();
    const { data: existing } = await supabase
      .from('conversation_members')
      .select('conversation_id, conversations!inner(type)')
      .eq('user_id', p.id);
    const found = (existing || []).find((m: any) => m.conversations?.type === 'direct');
    let convId: string;
    if (found) {
      convId = found.conversation_id;
      await supabase.from('conversation_members').upsert({
        conversation_id: convId, user_id: user.id, role: 'owner',
      });
    } else {
      const { data: conv, error } = await supabase.from('conversations').insert({
        type: 'direct', is_encrypted: true, created_by: user.id,
      }).select().single();
      if (error) { toast.error(error.message); return; }
      convId = conv.id;
      await supabase.from('conversation_members').insert([
        { conversation_id: convId, user_id: user.id, role: 'owner' },
        { conversation_id: convId, user_id: p.id, role: 'member' },
      ]);
    }
    setActiveConversation(convId);
    setMobileTab('chats');
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search users, communities…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {users.length > 0 && (
          <CommandGroup heading="Users">
            {users.map(u => (
              <CommandItem key={u.id} onSelect={() => startDm(u)}>
                <User className="mr-2 h-4 w-4" />
                <span>{u.display_name || u.username}</span>
                <span className="ml-2 text-xs text-muted-foreground">@{u.username}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {communities.length > 0 && (
          <CommandGroup heading="Communities">
            {communities.map(c => (
              <CommandItem key={c.id} onSelect={() => {
                setActiveView('communities');
                setMobileTab('communities');
                onOpenChange(false);
              }}>
                <Users className="mr-2 h-4 w-4" />
                <span>{c.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">@{c.slug}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}

import { getSupabaseClient, isSupabaseConfigured } from '../external/supabase.ts';
import { UserProfile, UserRole } from '../../shared/types/index.ts';

export interface VerifiedAuthContext {
  userId: string;
  email?: string;
  role: UserRole;
  displayName: string;
  isActive: boolean;
}

/**
 * Ensures a profile exists for the given Supabase user, auto-creating as 'viewer' if not present.
 */
export async function ensureUserProfile(
  userId: string,
  email?: string,
  rawDisplayName?: string
): Promise<UserProfile> {
  const client = getSupabaseClient();
  const displayName = rawDisplayName || (email ? email.split('@')[0] : 'User');

  // 1. Try to fetch existing profile
  const { data: existing, error: fetchErr } = await client
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (existing && !fetchErr) {
    return existing as UserProfile;
  }

  // 2. Insert default viewer profile if not found
  const now = new Date().toISOString();
  const newProfile: Partial<UserProfile> = {
    id: userId,
    display_name: displayName,
    role: 'viewer',
    is_active: true,
    created_at: now,
    updated_at: now,
  };

  const { data: inserted, error: insertErr } = await client
    .from('profiles')
    .insert(newProfile)
    .select('*')
    .single();

  if (insertErr) {
    // If conflict or already created by trigger, re-fetch
    const { data: refetched } = await client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (refetched) return refetched as UserProfile;
    
    // Fallback in-memory profile if database profile table not yet created
    return {
      id: userId,
      display_name: displayName,
      role: 'viewer',
      is_active: true,
      created_at: now,
      updated_at: now,
    };
  }

  return inserted as UserProfile;
}

/**
 * Verifies JWT token from Authorization header against Supabase Auth.
 */
export async function verifyAuthToken(token: string): Promise<VerifiedAuthContext | null> {
  if (!isSupabaseConfigured() || !token) {
    return null;
  }

  try {
    const client = getSupabaseClient();
    const { data: authData, error: authErr } = await client.auth.getUser(token);

    if (authErr || !authData?.user) {
      return null;
    }

    const user = authData.user;
    const profile = await ensureUserProfile(
      user.id,
      user.email,
      user.user_metadata?.display_name
    );

    return {
      userId: user.id,
      email: user.email,
      role: profile.role || 'viewer',
      displayName: profile.display_name || user.email?.split('@')[0] || 'User',
      isActive: profile.is_active !== false,
    };
  } catch (err) {
    console.error('[AuthService] Token verification error:', err);
    return null;
  }
}

/**
 * Admin: List all user profiles with auth emails.
 */
export async function listAllUserProfiles(): Promise<UserProfile[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list users: ${error.message}`);
  }

  return data as UserProfile[];
}

/**
 * Admin: Update user role.
 */
export async function updateUserRole(userId: string, role: UserRole): Promise<UserProfile> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('profiles')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to update user role: ${error.message}`);
  }

  return data as UserProfile;
}

/**
 * Admin: Update user active status.
 */
export async function updateUserStatus(userId: string, isActive: boolean): Promise<UserProfile> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('profiles')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to update user status: ${error.message}`);
  }

  return data as UserProfile;
}

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

// Creator-side sales summary for one course. Reads the buyer entitlements and the
// earnings ledger (owner-visible via RLS). Earnings rows are written server-side by
// the Stripe webhook; free grants show as buyers with no earnings.

export interface CourseSales {
  buyers: number;
  netCents: number;
  grossCents: number;
  loading: boolean;
}

export function useCourseSales(courseId: string): CourseSales {
  const [sales, setSales] = useState<CourseSales>({ buyers: 0, netCents: 0, grossCents: 0, loading: true });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [ent, earn] = await Promise.all([
        supabase.from('course_entitlements').select('id', { count: 'exact', head: true }).eq('course_id', courseId),
        supabase.from('creator_earnings').select('net_cents, gross_cents').eq('course_id', courseId),
      ]);
      if (cancelled) return;
      const net = (earn.data ?? []).reduce((s, r: any) => s + (r.net_cents ?? 0), 0);
      const gross = (earn.data ?? []).reduce((s, r: any) => s + (r.gross_cents ?? 0), 0);
      setSales({ buyers: ent.count ?? 0, netCents: net, grossCents: gross, loading: false });
    })();
    return () => { cancelled = true; };
  }, [courseId]);

  return sales;
}

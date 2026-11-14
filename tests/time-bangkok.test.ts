import { describe, expect, it } from 'vitest';
import {
  bangkokLocalToUtc,
  getBangkokParts,
  getMondaySundayPeriodBounds,
  isPastDeadline,
} from '@/server/modules/time/bangkok';

describe('Bangkok Time & Reporting Period Math (DEC-01, DEC-02)', () => {
  it('computes Monday 00:00 ICT to Sunday 20:00/20:30 ICT accurately across timezone edges', () => {
    // 2026-11-11 Wednesday 23:30 UTC -> 2026-11-12 Thursday 06:30 ICT
    const ref = new Date('2026-11-11T23:30:00Z');
    const parts = getBangkokParts(ref);
    expect(parts.isoDate).toBe('2026-11-12');
    expect(parts.isoWeekday).toBe(4); // Thursday

    const window = getMondaySundayPeriodBounds(ref);
    expect(window.startDate).toBe('2026-11-09'); // Monday
    expect(window.endDate).toBe('2026-11-15'); // Sunday
    expect(window.periodKey).toBe('2026-W46');
    expect(window.deadlineAt.toISOString()).toBe(
      bangkokLocalToUtc('2026-11-15', '20:00').toISOString()
    );
    expect(window.briefScheduledAt.toISOString()).toBe(
      bangkokLocalToUtc('2026-11-15', '20:30').toISOString()
    );
  });

  it('handles Sunday 19:59:59 ICT vs Sunday 20:00:01 ICT late boundary strictly', () => {
    const window = getMondaySundayPeriodBounds(new Date('2026-11-15T10:00:00Z'));
    const beforeCutoff = new Date('2026-11-15T19:59:59+07:00');
    const exactCutoff = new Date('2026-11-15T20:00:00+07:00');
    const afterCutoff = new Date('2026-11-15T20:00:01+07:00');

    expect(isPastDeadline(beforeCutoff, window.deadlineAt)).toBe(false);
    expect(isPastDeadline(exactCutoff, window.deadlineAt)).toBe(false);
    expect(isPastDeadline(afterCutoff, window.deadlineAt)).toBe(true);
  });

  it('keeps Sunday night 23:55 ICT inside the closing week rather than next Monday', () => {
    const sundayLate = new Date('2026-11-15T23:55:00+07:00'); // 16:55 UTC
    const window = getMondaySundayPeriodBounds(sundayLate);
    expect(window.startDate).toBe('2026-11-09');
    expect(window.endDate).toBe('2026-11-15');
    expect(window.periodKey).toBe('2026-W46');
  });
});

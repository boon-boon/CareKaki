import { extractCareTiming, parseBudgetMYR, parseCareSchedule, shiftEnd } from './intake-form';

describe('shiftEnd', () => {
  it('adds a duration to a start time', () => {
    expect(shiftEnd('09:00', 8)).toBe('17:00');
    expect(shiftEnd('08:00', 4)).toBe('12:00');
  });

  it('rejects invalid input and day overflow', () => {
    expect(shiftEnd('9am', 2)).toBe('');
    expect(shiftEnd('09:00', 0)).toBe('');
    expect(shiftEnd('20:00', 8)).toBe('');
  });
});

describe('extractCareTiming', () => {
  it('reads standalone 12-hour times and converts them to 24-hour format', () => {
    for (const [input, expected] of [
      ['1pm', '13:00'],
      ['1 pm', '13:00'],
      ['1:30pm', '13:30'],
      ['12am', '00:00'],
      ['12pm', '12:00'],
      ['9am', '09:00'],
      ['13:00', '13:00'],
    ]) {
      expect(extractCareTiming(input).start).toBe(expected);
    }
  });

  it('does not mistake an amount or date for a start time', () => {
    expect(extractCareTiming('150').start).toBe('');
    expect(extractCareTiming('2026-10-17').start).toBe('');
  });

  it('reads an ISO date and a clock range', () => {
    const t = extractCareTiming('elderly care on 2026-10-17 from 09:00 to 17:00');
    expect(t.date).toBe('2026-10-17');
    expect(t.start).toBe('09:00');
    expect(t.end).toBe('17:00');
    expect(t.duration).toBe(8);
    expect(t.missing).toEqual([]);
  });

  it('never mistakes the date digits for a time range', () => {
    // "2026-10-17" must not be read as "26-10".
    const t = extractCareTiming('care on 2026-10-17, 9am to 5pm');
    expect(t.date).toBe('2026-10-17');
    expect(t.start).toBe('09:00');
    expect(t.end).toBe('17:00');
  });

  it('understands a bare "1 November" using the default year', () => {
    const t = extractCareTiming('starting 1 November, 9am to 5pm');
    expect(t.date).toBe('2026-11-01');
    expect(t.duration).toBe(8);
  });

  it('derives the end time from an explicit duration', () => {
    const t = extractCareTiming('starting at 10:00 for 2 hours');
    expect(t.start).toBe('10:00');
    expect(t.duration).toBe(2);
    expect(t.end).toBe('12:00');
  });

  it('reports which slots are still missing', () => {
    expect(extractCareTiming('someone to help').missing).toContain('date');
    expect(extractCareTiming('someone to help').missing).toContain('start_time');
  });
});

describe('parseBudgetMYR', () => {
  it('accepts a plain amount in the budget question as MYR', () => {
    expect(parseBudgetMYR('150', true)).toBe(150);
    expect(parseBudgetMYR(' 150.50 ', true)).toBe(150.50);
  });

  it('accepts explicit currency and unlabeled MYR budget statements', () => {
    expect(parseBudgetMYR('RM150')).toBe(150);
    expect(parseBudgetMYR('150 ringgit')).toBe(150);
    expect(parseBudgetMYR('Budget is 150')).toBe(150);
    expect(parseBudgetMYR('max budget 200')).toBe(200);
  });

  it('does not misidentify unrelated dates, times, or invalid budgets', () => {
    expect(parseBudgetMYR('2026-10-17')).toBeUndefined();
    expect(parseBudgetMYR('1pm')).toBeUndefined();
    expect(parseBudgetMYR('150')).toBeUndefined();
    expect(parseBudgetMYR('0', true)).toBeUndefined();
    expect(parseBudgetMYR('-150', true)).toBeUndefined();
  });
});

describe('parseCareSchedule', () => {
  it('maps weekday(s) to Monday through Friday and weekend(s) to Saturday and Sunday', () => {
    for (const word of ['weekday', 'weekdays']) {
      const result = parseCareSchedule(word + ' 9am to 5pm, starting 2026-10-12');
      expect(result.days).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
      expect(result.recurring).toBe(true);
      expect(result.concreteDates.every(date =>
        [1, 2, 3, 4, 5].includes(new Date(date + 'T00:00:00Z').getUTCDay()))).toBe(true);
    }
    for (const word of ['weekend', 'weekends']) {
      const result = parseCareSchedule(word + ' 9am to 5pm, starting 2026-10-17');
      expect(result.days).toEqual(['Sat', 'Sun']);
      expect(result.recurring).toBe(true);
      expect(result.concreteDates.every(date =>
        [0, 6].includes(new Date(date + 'T00:00:00Z').getUTCDay()))).toBe(true);
    }
  });

  it('expands a two-day weekly pattern from an anchor date', () => {
    const s = parseCareSchedule('Saturdays and Sundays, 9am to 5pm, starting 1 November');
    expect(s.recurring).toBe(true);
    expect(s.days).toEqual(['Sat', 'Sun']);
    expect(s.startDate).toBe('2026-11-01'); // a Sunday
    expect(s.start).toBe('09:00');
    expect(s.end).toBe('17:00');
    expect(s.duration).toBe(8);
    // Every generated occurrence must fall on a selected weekday.
    expect(s.concreteDates.length).toBeGreaterThan(1);
    for (const iso of s.concreteDates) {
      const js = new Date(`${iso}T00:00:00Z`).getUTCDay();
      expect([0, 6]).toContain(js);
    }
  });

  it('treats a weekday range as recurring', () => {
    const s = parseCareSchedule('Monday to Friday, 8am to 4pm, starting next Monday');
    expect(s.recurring).toBe(true);
    expect(s.days).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    expect(s.duration).toBe(8);
  });

  it('understands "every <weekday>" with an explicit duration', () => {
    const s = parseCareSchedule('every Wednesday at 10am for 2 hours');
    expect(s.days).toEqual(['Wed']);
    expect(s.recurring).toBe(true);
    expect(s.start).toBe('10:00');
    expect(s.duration).toBe(2);
    expect(s.startDate).not.toBe('');
  });

  it('understands the weekend keyword', () => {
    const s = parseCareSchedule('weekend visits, 9am to 12pm, starting 1 November');
    expect(s.days).toEqual(['Sat', 'Sun']);
    expect(s.recurring).toBe(true);
  });

  it('keeps a single explicit date non-recurring', () => {
    const s = parseCareSchedule('single trip on 2026-10-15, 7am to 11am');
    expect(s.recurring).toBe(false);
    expect(s.startDate).toBe('2026-10-15');
    expect(s.concreteDates).toEqual(['2026-10-15']);
    expect(s.duration).toBe(4);
  });

  it('does not treat "daily living" as a seven-day schedule', () => {
    // "daily living" is a care service description, not a recurrence.
    const s = parseCareSchedule('help with daily living in Cheras on 2026-10-17, 9am to 5pm');
    expect(s.recurring).toBe(false);
    expect(s.days).toEqual([]);
    expect(s.startDate).toBe('2026-10-17');
  });

  it('does not read "except 25 December" as the start date', () => {
    const s = parseCareSchedule(
      'Saturdays and Sundays, 9am to 5pm, starting 1 November except 25 December',
    );
    expect(s.startDate).toBe('2026-11-01');
    expect(s.days).toEqual(['Sat', 'Sun']);
  });

  it('returns an empty result for text with no schedule at all', () => {
    const s = parseCareSchedule('please help my father');
    expect(s.startDate).toBe('');
    expect(s.days).toEqual([]);
    expect(s.recurring).toBe(false);
  });
});

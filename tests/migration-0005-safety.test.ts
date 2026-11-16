import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createInMemoryTestRuntime } from '@/server/db/client';
import { applyMigrations } from '@/server/db/migrate';
import fs from 'node:fs';
import path from 'node:path';

describe('Phase 4: Database Migration Safety (Migration 0005)', () => {
  it('runs cleanly against an empty database', async () => {
    const runtime = await createInMemoryTestRuntime();
    // Running all migrations 0000..0005 on fresh DB
    await applyMigrations(runtime);

    const tables = await runtime.db.execute(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    );
    const rows = (tables as unknown as { rows: Array<{ table_name: string }> }).rows;
    expect(rows.length).toBeGreaterThanOrEqual(37);
  });

  it('safely migrates representative legacy rows, NULLs, unexpected values, and duplicate dedup keys', async () => {
    const runtime = await createInMemoryTestRuntime();
    const drizzleDir = path.resolve(process.cwd(), 'drizzle');

    // Apply migrations 0000 through 0004 manually first to simulate a legacy DB at migration 0004
    const migrationFiles = [
      '0000_baseline.sql',
      '0001_immutable_triggers.sql',
      '0002_data_quality_decisions.sql',
      '0003_data_quality_decisions_immutable.sql',
      '0004_team_field_points_scope.sql',
    ];

    for (const f of migrationFiles) {
      const sqlContent = fs.readFileSync(path.join(drizzleDir, f), 'utf8');
      const statements = sqlContent.split('--> statement-breakpoint');
      for (const st of statements) {
        const trimmed = st.trim();
        if (trimmed) {
          await runtime.db.execute(sql.raw(trimmed));
        }
      }
    }

    // Insert representative legacy data into 0004 schema:
    // 1. Body and Group
    const [body] = (await runtime.db.execute(sql`
      INSERT INTO bodies (code, name_th, status)
      VALUES ('B-TEST', 'บอดี้ทดสอบ', 'active')
      RETURNING id
    `)).rows as Array<{ id: string }>;

    const [group] = (await runtime.db.execute(sql`
      INSERT INTO house_mission_groups (group_code, name_th, body_id, district, status)
      VALUES ('G-TEST', 'กลุ่มทดสอบ', ${body!.id}, 'เมือง', 'active')
      RETURNING id
    `)).rows as Array<{ id: string }>;

    // 2. Members (distinct members to satisfy (weekly_report_id, member_id) unique constraint)
    const [member1] = (await runtime.db.execute(sql`
      INSERT INTO members (member_code, full_name, display_name)
      VALUES ('MEM-01', 'สมชาย ใจดี', 'สมชาย')
      RETURNING id
    `)).rows as Array<{ id: string }>;

    const [member2] = (await runtime.db.execute(sql`
      INSERT INTO members (member_code, full_name, display_name)
      VALUES ('MEM-02', 'สมหญิง รักสงบ', 'สมหญิง')
      RETURNING id
    `)).rows as Array<{ id: string }>;

    const [member3] = (await runtime.db.execute(sql`
      INSERT INTO members (member_code, full_name, display_name)
      VALUES ('MEM-03', 'มานะ อดทน', 'มานะ')
      RETURNING id
    `)).rows as Array<{ id: string }>;

    // 3. Reporting Period & Weekly report with submitted_at set
    const [period] = (await runtime.db.execute(sql`
      INSERT INTO reporting_periods (period_key, start_date, end_date, deadline_at, brief_scheduled_at, status)
      VALUES ('2026-W46', '2026-11-09', '2026-11-15', '2026-11-15 20:00:00+07', '2026-11-15 20:30:00+07', 'open')
      RETURNING id
    `)).rows as Array<{ id: string }>;

    const now = new Date();
    const [rep] = (await runtime.db.execute(sql`
      INSERT INTO weekly_reports (period_id, group_id, body_id, status, submitted_at, meeting_held)
      VALUES (${period!.id}, ${group!.id}, ${body!.id}, 'submitted', ${now.toISOString()}, true)
      RETURNING id, submitted_at
    `)).rows as Array<{ id: string; submitted_at: string }>;

    // 4. Attendance records with 'present' and 'excused' (both allowed in baseline schema)
    const [attPres] = (await runtime.db.execute(sql`
      INSERT INTO attendance_records (weekly_report_id, member_id, attendance_status)
      VALUES (${rep!.id}, ${member1!.id}, 'present')
      RETURNING id, attendance_status
    `)).rows as Array<{ id: string; attendance_status: string }>;

    const [attExc] = (await runtime.db.execute(sql`
      INSERT INTO attendance_records (weekly_report_id, member_id, attendance_status)
      VALUES (${rep!.id}, ${member2!.id}, 'excused')
      RETURNING id, attendance_status
    `)).rows as Array<{ id: string; attendance_status: string }>;

    // User for follow_up_items created_by_user_id
    const [user] = (await runtime.db.execute(sql`
      INSERT INTO users (username, display_name, password_hash, system_role, status)
      VALUES ('admin_test_0005', 'ผู้ดูแลระบบ', 'dummy_hash', 'admin', 'active')
      RETURNING id
    `)).rows as Array<{ id: string }>;

    // 5. Follow up items with completed status missing outcome_note
    const [fuCompleted] = (await runtime.db.execute(sql`
      INSERT INTO follow_up_items (group_id, title, status, created_by_user_id)
      VALUES (${group!.id}, 'งานติดตามเก่า', 'completed', ${user!.id})
      RETURNING id, status
    `)).rows as Array<{ id: string; status: string }>;

    const [fuOpen1] = (await runtime.db.execute(sql`
      INSERT INTO follow_up_items (group_id, title, status, created_by_user_id)
      VALUES (${group!.id}, 'งานเปิด 1', 'open', ${user!.id})
      RETURNING id, status
    `)).rows as Array<{ id: string; status: string }>;

    // Now execute migration 0005 SQL statements
    const sql0005 = fs.readFileSync(path.join(drizzleDir, '0005_report_content_followups_attendance.sql'), 'utf8');
    const statements0005 = sql0005.split('--> statement-breakpoint');
    for (const st of statements0005) {
      const trimmed = st.trim();
      if (trimmed) {
        await runtime.db.execute(sql.raw(trimmed));
      }
    }

    // Verify preservation & transformations:
    // 1. Attendance records:
    const attPresAfter = (await runtime.db.execute(sql`
      SELECT attendance_status FROM attendance_records WHERE id = ${attPres!.id}
    `)).rows[0] as { attendance_status: string };
    expect(attPresAfter.attendance_status).toBe('present');

    const attExcAfter = (await runtime.db.execute(sql`
      SELECT attendance_status FROM attendance_records WHERE id = ${attExc!.id}
    `)).rows[0] as { attendance_status: string };
    expect(attExcAfter.attendance_status).toBe('leave');

    // 2. Follow-up outcome notes:
    const fuCompletedAfter = (await runtime.db.execute(sql`
      SELECT status, outcome_note FROM follow_up_items WHERE id = ${fuCompleted!.id}
    `)).rows[0] as { status: string; outcome_note: string };
    expect(fuCompletedAfter.status).toBe('completed');
    expect(fuCompletedAfter.outcome_note).toContain('ไม่ได้บันทึกผลไว้');

    const fuOpen1After = (await runtime.db.execute(sql`
      SELECT status, outcome_note FROM follow_up_items WHERE id = ${fuOpen1!.id}
    `)).rows[0] as { status: string; outcome_note: string | null };
    expect(fuOpen1After.status).toBe('open');
    expect(fuOpen1After.outcome_note).toBeNull();

    // 3. Weekly report first_submitted_at:
    const repAfter = (await runtime.db.execute(sql`
      SELECT submitted_at, first_submitted_at FROM weekly_reports WHERE id = ${rep!.id}
    `)).rows[0] as { submitted_at: string; first_submitted_at: string };
    expect(repAfter.first_submitted_at).toBeDefined();
    expect(new Date(repAfter.first_submitted_at).getTime()).toBe(new Date(repAfter.submitted_at).getTime());

    // 4. Test constraint enforcement:
    const [period2] = (await runtime.db.execute(sql`
      INSERT INTO reporting_periods (period_key, start_date, end_date, deadline_at, brief_scheduled_at, status)
      VALUES ('2026-W47', '2026-11-16', '2026-11-22', '2026-11-22 20:00:00+07', '2026-11-22 20:30:00+07', 'open')
      RETURNING id
    `)).rows as Array<{ id: string }>;

    const [rep2] = (await runtime.db.execute(sql`
      INSERT INTO weekly_reports (period_id, group_id, body_id, status, submitted_at, meeting_held)
      VALUES (${period2!.id}, ${group!.id}, ${body!.id}, 'submitted', ${now.toISOString()}, true)
      RETURNING id
    `)).rows as Array<{ id: string }>;

    // Reject legacy 'excused'
    let caughtExcused = false;
    try {
      await runtime.db.execute(sql`
        INSERT INTO attendance_records (weekly_report_id, member_id, attendance_status)
        VALUES (${rep2!.id}, ${member1!.id}, 'excused')
      `);
    } catch {
      caughtExcused = true;
    }
    expect(caughtExcused).toBe(true);

    // Accept new statuses: 'leave', 'online'
    await runtime.db.execute(sql`
      INSERT INTO attendance_records (weekly_report_id, member_id, attendance_status)
      VALUES (${rep2!.id}, ${member1!.id}, 'leave')
    `);
    await runtime.db.execute(sql`
      INSERT INTO attendance_records (weekly_report_id, member_id, attendance_status)
      VALUES (${rep2!.id}, ${member2!.id}, 'online')
    `);

    // Reject completed follow up item without outcome_note
    let caughtNoOutcome = false;
    try {
      await runtime.db.execute(sql`
        INSERT INTO follow_up_items (group_id, title, status, outcome_note, created_by_user_id)
        VALUES (${group!.id}, 'งานติดตามไม่มีผล', 'completed', NULL, ${user!.id})
      `);
    } catch {
      caughtNoOutcome = true;
    }
    expect(caughtNoOutcome).toBe(true);

    // Reject duplicate open source_dedup_key
    await runtime.db.execute(sql`
      INSERT INTO follow_up_items (group_id, title, status, source_dedup_key, created_by_user_id)
      VALUES (${group!.id}, 'งานเปิด DEDUP', 'open', 'dedup-test-key-1', ${user!.id})
    `);

    let caughtDupDedup = false;
    try {
      await runtime.db.execute(sql`
        INSERT INTO follow_up_items (group_id, title, status, source_dedup_key, created_by_user_id)
        VALUES (${group!.id}, 'งานเปิด DEDUP 2', 'open', 'dedup-test-key-1', ${user!.id})
      `);
    } catch {
      caughtDupDedup = true;
    }
    expect(caughtDupDedup).toBe(true);
  });

  it('deduplication CTE cancels later duplicate open items and preserves the oldest item before unique index creation', async () => {
    const runtime = await createInMemoryTestRuntime();
    const drizzleDir = path.resolve(process.cwd(), 'drizzle');

    // Apply migrations 0000 through 0004
    for (const f of [
      '0000_baseline.sql',
      '0001_immutable_triggers.sql',
      '0002_data_quality_decisions.sql',
      '0003_data_quality_decisions_immutable.sql',
      '0004_team_field_points_scope.sql',
    ]) {
      const sqlContent = fs.readFileSync(path.join(drizzleDir, f), 'utf8');
      for (const st of sqlContent.split('--> statement-breakpoint')) {
        const trimmed = st.trim();
        if (trimmed) await runtime.db.execute(sql.raw(trimmed));
      }
    }

    const [body] = (await runtime.db.execute(sql`
      INSERT INTO bodies (code, name_th, status) VALUES ('B-DEDUP', 'บอดี้ DEDUP', 'active') RETURNING id
    `)).rows as Array<{ id: string }>;
    const [group] = (await runtime.db.execute(sql`
      INSERT INTO house_mission_groups (group_code, name_th, body_id, district, status)
      VALUES ('G-DEDUP', 'กลุ่ม DEDUP', ${body!.id}, 'เมือง', 'active') RETURNING id
    `)).rows as Array<{ id: string }>;
    const [user] = (await runtime.db.execute(sql`
      INSERT INTO users (username, display_name, password_hash, system_role, status)
      VALUES ('admin_dedup', 'ผู้ดูแล DEDUP', 'dummy', 'admin', 'active') RETURNING id
    `)).rows as Array<{ id: string }>;

    // Add source_dedup_key column as migration 0005 does
    await runtime.db.execute(sql`ALTER TABLE follow_up_items ADD COLUMN source_dedup_key text`);
    await runtime.db.execute(sql`ALTER TABLE follow_up_items ADD COLUMN source_type text DEFAULT 'manual' NOT NULL`);
    await runtime.db.execute(sql`ALTER TABLE follow_up_items ADD COLUMN priority text DEFAULT 'normal' NOT NULL`);
    await runtime.db.execute(sql`ALTER TABLE follow_up_items ADD COLUMN outcome_note text`);

    // Insert 3 duplicate open items with the SAME source_dedup_key created at different timestamps
    const [first] = (await runtime.db.execute(sql`
      INSERT INTO follow_up_items (group_id, title, status, source_dedup_key, created_by_user_id, created_at)
      VALUES (${group!.id}, 'รายการแรก', 'open', 'same-dedup-key', ${user!.id}, '2026-11-01 10:00:00+07')
      RETURNING id, status
    `)).rows as Array<{ id: string; status: string }>;

    const [second] = (await runtime.db.execute(sql`
      INSERT INTO follow_up_items (group_id, title, status, source_dedup_key, created_by_user_id, created_at)
      VALUES (${group!.id}, 'รายการสอง (ซ้ำ)', 'in_progress', 'same-dedup-key', ${user!.id}, '2026-11-02 10:00:00+07')
      RETURNING id, status
    `)).rows as Array<{ id: string; status: string }>;

    const [third] = (await runtime.db.execute(sql`
      INSERT INTO follow_up_items (group_id, title, status, source_dedup_key, created_by_user_id, created_at)
      VALUES (${group!.id}, 'รายการสาม (ซ้ำ)', 'open', 'same-dedup-key', ${user!.id}, '2026-11-03 10:00:00+07')
      RETURNING id, status
    `)).rows as Array<{ id: string; status: string }>;

    // Execute migration 0005 CTE statement
    await runtime.db.execute(sql`
      WITH dups AS (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY source_dedup_key ORDER BY created_at ASC) AS rnum
        FROM follow_up_items
        WHERE source_dedup_key IS NOT NULL AND status IN ('open', 'in_progress')
      )
      UPDATE follow_up_items
      SET status = 'cancelled', outcome_note = 'ยกเลิกเนื่องจากเป็นรายการซ้ำก่อนทำ index'
      WHERE id IN (SELECT id FROM dups WHERE rnum > 1)
    `);

    // Execute index creation: should succeed without unique constraint error
    await runtime.db.execute(sql`
      CREATE UNIQUE INDEX follow_up_open_dedup_uidx ON follow_up_items USING btree (source_dedup_key)
      WHERE source_dedup_key IS NOT NULL AND status IN ('open', 'in_progress')
    `);

    // Verify first item is preserved as 'open' with no outcome note
    const [firstAfter] = (await runtime.db.execute(sql`
      SELECT status, outcome_note FROM follow_up_items WHERE id = ${first!.id}
    `)).rows as Array<{ status: string; outcome_note: string | null }>;
    expect(firstAfter!.status).toBe('open');
    expect(firstAfter!.outcome_note).toBeNull();

    // Verify second and third items are cancelled with descriptive outcome note
    const [secondAfter] = (await runtime.db.execute(sql`
      SELECT status, outcome_note FROM follow_up_items WHERE id = ${second!.id}
    `)).rows as Array<{ status: string; outcome_note: string }>;
    expect(secondAfter!.status).toBe('cancelled');
    expect(secondAfter!.outcome_note).toBe('ยกเลิกเนื่องจากเป็นรายการซ้ำก่อนทำ index');

    const [thirdAfter] = (await runtime.db.execute(sql`
      SELECT status, outcome_note FROM follow_up_items WHERE id = ${third!.id}
    `)).rows as Array<{ status: string; outcome_note: string }>;
    expect(thirdAfter!.status).toBe('cancelled');
    expect(thirdAfter!.outcome_note).toBe('ยกเลิกเนื่องจากเป็นรายการซ้ำก่อนทำ index');
  });

  it('fails fast with clear error and aborts migration when an abnormal attendance status is detected', async () => {
    const runtime = await createInMemoryTestRuntime();
    const drizzleDir = path.resolve(process.cwd(), 'drizzle');
    for (const f of [
      '0000_baseline.sql',
      '0001_immutable_triggers.sql',
      '0002_data_quality_decisions.sql',
      '0003_data_quality_decisions_immutable.sql',
      '0004_team_field_points_scope.sql',
    ]) {
      for (const st of fs.readFileSync(path.join(drizzleDir, f), 'utf8').split('--> statement-breakpoint')) {
        const trimmed = st.trim();
        if (trimmed) await runtime.db.execute(sql.raw(trimmed));
      }
    }
    const [body] = (await runtime.db.execute(sql`INSERT INTO bodies (code, name_th) VALUES ('B1', 'B1') RETURNING id`)).rows as Array<{ id: string }>;
    const [grp] = (await runtime.db.execute(sql`INSERT INTO house_mission_groups (group_code, name_th, body_id, district) VALUES ('G1', 'G1', ${body!.id}, 'เมือง') RETURNING id`)).rows as Array<{ id: string }>;
    const [mem] = (await runtime.db.execute(sql`INSERT INTO members (member_code, full_name, display_name) VALUES ('M1', 'M1', 'M1') RETURNING id`)).rows as Array<{ id: string }>;
    const [period] = (await runtime.db.execute(sql`INSERT INTO reporting_periods (period_key, start_date, end_date, deadline_at, brief_scheduled_at, status) VALUES ('2026-W46', '2026-11-09', '2026-11-15', '2026-11-15 20:00:00+07', '2026-11-15 20:30:00+07', 'open') RETURNING id`)).rows as Array<{ id: string }>;
    const [rep] = (await runtime.db.execute(sql`INSERT INTO weekly_reports (period_id, group_id, body_id, status) VALUES (${period!.id}, ${grp!.id}, ${body!.id}, 'draft') RETURNING id`)).rows as Array<{ id: string }>;

    await runtime.db.execute(sql`ALTER TABLE attendance_records DROP CONSTRAINT attendance_status_chk`);
    await runtime.db.execute(sql`INSERT INTO attendance_records (weekly_report_id, member_id, attendance_status) VALUES (${rep!.id}, ${mem!.id}, 'corrupt_status_xyz')`);

    const sql0005 = fs.readFileSync(path.join(drizzleDir, '0005_report_content_followups_attendance.sql'), 'utf8');
    const firstStatement = sql0005.split('--> statement-breakpoint')[0]!.trim();

    let errorThrown: Error | null = null;
    try {
      await runtime.db.execute(sql.raw(firstStatement));
    } catch (e) {
      errorThrown = e as Error;
    }
    expect(errorThrown).not.toBeNull();
    const errText = ((errorThrown as any)?.cause?.message ?? errorThrown?.message) as string;
    expect(errText).toContain('MIGRATION_0005_FAIL_FAST');
    expect(errText).toContain('corrupt_status_xyz');
    expect(errText).toContain('1 รายการ');

    // Confirm that the corrupt row was NOT mutated
    const [checkRow] = (await runtime.db.execute(sql`SELECT attendance_status FROM attendance_records WHERE weekly_report_id = ${rep!.id}`)).rows as Array<{ attendance_status: string }>;
    expect(checkRow!.attendance_status).toBe('corrupt_status_xyz');
  });

  it('fails fast with clear error and aborts migration when a NULL attendance status is detected', async () => {
    const runtime = await createInMemoryTestRuntime();
    const drizzleDir = path.resolve(process.cwd(), 'drizzle');
    for (const f of [
      '0000_baseline.sql',
      '0001_immutable_triggers.sql',
      '0002_data_quality_decisions.sql',
      '0003_data_quality_decisions_immutable.sql',
      '0004_team_field_points_scope.sql',
    ]) {
      for (const st of fs.readFileSync(path.join(drizzleDir, f), 'utf8').split('--> statement-breakpoint')) {
        const trimmed = st.trim();
        if (trimmed) await runtime.db.execute(sql.raw(trimmed));
      }
    }
    const [body] = (await runtime.db.execute(sql`INSERT INTO bodies (code, name_th) VALUES ('B2', 'B2') RETURNING id`)).rows as Array<{ id: string }>;
    const [grp] = (await runtime.db.execute(sql`INSERT INTO house_mission_groups (group_code, name_th, body_id, district) VALUES ('G2', 'G2', ${body!.id}, 'เมือง') RETURNING id`)).rows as Array<{ id: string }>;
    const [mem] = (await runtime.db.execute(sql`INSERT INTO members (member_code, full_name, display_name) VALUES ('M2', 'M2', 'M2') RETURNING id`)).rows as Array<{ id: string }>;
    const [period] = (await runtime.db.execute(sql`INSERT INTO reporting_periods (period_key, start_date, end_date, deadline_at, brief_scheduled_at, status) VALUES ('2026-W46', '2026-11-09', '2026-11-15', '2026-11-15 20:00:00+07', '2026-11-15 20:30:00+07', 'open') RETURNING id`)).rows as Array<{ id: string }>;
    const [rep] = (await runtime.db.execute(sql`INSERT INTO weekly_reports (period_id, group_id, body_id, status) VALUES (${period!.id}, ${grp!.id}, ${body!.id}, 'draft') RETURNING id`)).rows as Array<{ id: string }>;

    await runtime.db.execute(sql`ALTER TABLE attendance_records DROP CONSTRAINT attendance_status_chk`);
    await runtime.db.execute(sql`ALTER TABLE attendance_records ALTER COLUMN attendance_status DROP NOT NULL`);
    await runtime.db.execute(sql`INSERT INTO attendance_records (weekly_report_id, member_id, attendance_status) VALUES (${rep!.id}, ${mem!.id}, NULL)`);

    const sql0005 = fs.readFileSync(path.join(drizzleDir, '0005_report_content_followups_attendance.sql'), 'utf8');
    const firstStatement = sql0005.split('--> statement-breakpoint')[0]!.trim();

    let errorThrown: Error | null = null;
    try {
      await runtime.db.execute(sql.raw(firstStatement));
    } catch (e) {
      errorThrown = e as Error;
    }
    expect(errorThrown).not.toBeNull();
    const errText = ((errorThrown as any)?.cause?.message ?? errorThrown?.message) as string;
    expect(errText).toContain('MIGRATION_0005_FAIL_FAST');
    expect(errText).toContain('NULL');
    expect(errText).toContain('1 รายการ');

    // Confirm that the NULL row was NOT mutated
    const [checkRow] = (await runtime.db.execute(sql`SELECT attendance_status FROM attendance_records WHERE weekly_report_id = ${rep!.id}`)).rows as Array<{ attendance_status: string | null }>;
    expect(checkRow!.attendance_status).toBeNull();
  });
});

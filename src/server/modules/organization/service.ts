import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { FaithMapDb } from '@/server/db/client';
import {
  assignments,
  authSessions,
  bodies,
  cares,
  externalIdentities,
  groupBodyTransfers,
  houseMissionGroups,
  userPasskeys,
  users,
  weeklyReports,
  reportingPeriods,
} from '@/server/db/schema';
import { AppError, isUniqueViolation } from '../errors';
import { recordSecurityAudit } from '../audit/service';
import {
  isAdmin,
  isBodyLeaderForBody,
  isGlobalMetricsReader,
  isGroupLeaderForGroup,
  assertCanManageBodyScope,
} from '../authz/policy';
import { dispatchNotification } from '../notifications/service';
import {
  isUsableAccount,
  type AccountStatus,
  type ActorContext,
  type AssignmentRole,
  type SystemRole,
} from '../identity/service';

export async function listBodiesWithLeaders(db: FaithMapDb, actor: ActorContext) {
  const allBodies = await db.select().from(bodies).orderBy(asc(bodies.sortOrder), asc(bodies.code));
  const allGroups = await db.select().from(houseMissionGroups);
  const activeBodyAssignments = await db
    .select()
    .from(assignments)
    .where(and(eq(assignments.scopeType, 'body'), isNull(assignments.effectiveTo)));

  const assignedUserIds = activeBodyAssignments
    .map((a) => a.userId)
    .filter((id): id is string => Boolean(id));

  const assignedUsers =
    assignedUserIds.length > 0
      ? await db
          .select({
            id: users.id,
            displayName: users.displayName,
            status: users.status,
            passwordHash: users.passwordHash,
          })
          .from(users)
          .where(inArray(users.id, assignedUserIds))
      : [];

  const userMap = new Map(assignedUsers.map((u) => [u.id, u]));
  const usabilityMap = new Map<string, boolean>();
  for (const u of assignedUsers) {
    usabilityMap.set(u.id, await isUsableAccount(db, u));
  }

  return allBodies
    .filter((b) => {
      if (isGlobalMetricsReader(actor)) return true;
      if (isBodyLeaderForBody(actor, b.id)) return true;
      return allGroups.some((g) => g.bodyId === b.id && actor.assignedGroupIds.has(g.id));
    })
    .map((b) => {
      const leaders = activeBodyAssignments
        .filter((a) => a.bodyId === b.id)
        .map((a) => {
          const u = a.userId ? userMap.get(a.userId) : undefined;
          return {
            assignmentId: a.id,
            userId: a.userId ?? '',
            displayName: u?.displayName ?? a.stewardDisplayName ?? 'ไม่ระบุชื่อ',
            accountStatus: u?.status ?? (a.linkStatus === 'unlinked_pending_account' ? 'unlinked_pending_account' : 'unknown'),
            isUsable: a.userId ? (usabilityMap.get(a.userId) ?? false) : false,
            isPrimary: a.isPrimary,
          };
        });
      const groupsInBody = allGroups.filter((g) => g.bodyId === b.id);
      return {
        ...b,
        activeGroupCount: groupsInBody.filter((g) => g.status === 'active').length,
        totalGroupCount: groupsInBody.length,
        bodyLeaders: leaders,
        hasEligibleBodyLeader: leaders.some((l) => l.isUsable),
      };
    });
}

export async function listGroupsWithContext(
  db: FaithMapDb,
  actor: ActorContext,
  options?: { periodId?: string; bodyId?: string }
) {
  const allBodies = await db.select().from(bodies);
  const bodyMap = new Map(allBodies.map((b) => [b.id, b]));
  const allGroups = await db
    .select()
    .from(houseMissionGroups)
    .orderBy(asc(houseMissionGroups.groupCode));

  const visibleGroups = allGroups.filter((g) => {
    if (options?.bodyId && g.bodyId !== options.bodyId) return false;
    if (isGlobalMetricsReader(actor)) return true;
    if (isBodyLeaderForBody(actor, g.bodyId)) return true;
    return actor.assignedGroupIds.has(g.id);
  });

  const activeGroupAssignments = await db
    .select()
    .from(assignments)
    .where(and(eq(assignments.scopeType, 'group'), isNull(assignments.effectiveTo)));

  const userRows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      status: users.status,
      passwordHash: users.passwordHash,
    })
    .from(users);
  const userMap = new Map(userRows.map((u) => [u.id, u]));

  let targetPeriodId = options?.periodId;
  if (!targetPeriodId) {
    const [openPeriod] = await db
      .select()
      .from(reportingPeriods)
      .where(eq(reportingPeriods.status, 'open'))
      .limit(1);
    targetPeriodId = openPeriod?.id;
  }

  const periodReports = targetPeriodId
    ? await db.select().from(weeklyReports).where(eq(weeklyReports.periodId, targetPeriodId))
    : [];
  const reportByGroupId = new Map(periodReports.map((r) => [r.groupId, r]));

  return visibleGroups.map((g) => {
    const groupAssignments = activeGroupAssignments
      .filter((a) => a.groupId === g.id)
      .map((a) => {
        const u = a.userId ? userMap.get(a.userId) : undefined;
        return {
          id: a.id,
          userId: a.userId ?? '',
          displayName: u?.displayName ?? a.stewardDisplayName ?? 'ไม่ระบุชื่อ',
          accountStatus: u?.status ?? (a.linkStatus === 'unlinked_pending_account' ? 'unlinked_pending_account' : 'unknown'),
          roleType: a.roleType as AssignmentRole,
          isPrimary: a.isPrimary,
        };
      });

    const rawReport = reportByGroupId.get(g.id);
    // FR-07.5: Draft reports MUST appear as not_submitted to non-group-leaders!
    let reportSummary: {
      reportId: string | null;
      status: string;
      meetingHeld: boolean | null;
      totalAttendees: number;
      isBlocked: boolean;
      blockedReason: string | null;
      isLate: boolean;
      requiresSupervisorReview: boolean;
    };

    if (!rawReport) {
      reportSummary = {
        reportId: null,
        status: 'not_submitted',
        meetingHeld: null,
        totalAttendees: 0,
        isBlocked: false,
        blockedReason: null,
        isLate: false,
        requiresSupervisorReview: groupAssignments.some(
          (a) => a.roleType === 'care_leader' || a.roleType === 'coordinator'
        ),
      };
    } else if (rawReport.status === 'draft' && !isGroupLeaderForGroup(actor, g.id)) {
      reportSummary = {
        reportId: null,
        status: 'not_submitted',
        meetingHeld: null,
        totalAttendees: 0,
        isBlocked: false,
        blockedReason: null,
        isLate: false,
        requiresSupervisorReview: rawReport.requiresSupervisorReview,
      };
    } else {
      reportSummary = {
        reportId: rawReport.id,
        status: rawReport.status,
        meetingHeld: rawReport.meetingHeld,
        totalAttendees: rawReport.totalAttendees,
        isBlocked: rawReport.isBlocked,
        blockedReason: rawReport.blockedReason,
        isLate: rawReport.isLate,
        requiresSupervisorReview: rawReport.requiresSupervisorReview,
      };
    }

    return {
      ...g,
      bodyName: g.bodyId ? bodyMap.get(g.bodyId)?.nameTh ?? '' : 'รอจัดสรรบอดี้',
      assignments: groupAssignments,
      currentReport: reportSummary,
    };
  });
}

export async function createGroup(
  db: FaithMapDb,
  actor: ActorContext,
  input: {
    groupCode: string;
    bodyId?: string | null;
    nameTh: string;
    district: string;
    subdistrict?: string | null;
    village?: string | null;
    careCodeRaw?: string | null;
    addressSummary?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    meetingDayOfWeek?: number | null;
    meetingTimeLocal?: string | null;
    targetAttendance?: number;
    notes?: string;
  }
) {
  assertCanManageBodyScope(actor, input.bodyId ?? null);
  if (input.bodyId) {
    const [bodyRow] = await db.select({ id: bodies.id }).from(bodies).where(eq(bodies.id, input.bodyId));
    if (!bodyRow) throw new AppError(404, 'BODY_NOT_FOUND', 'ไม่พบบอดี้ที่ระบุ');
  }

  const hasCoords =
    typeof input.latitude === 'number' && typeof input.longitude === 'number';
  const bodyId = input.bodyId ?? null;

  let created: typeof houseMissionGroups.$inferSelect | undefined;
  try {
    [created] = await db
    .insert(houseMissionGroups)
    .values({
      groupCode: input.groupCode.trim().toUpperCase(),
      bodyId,
      nameTh: input.nameTh.trim(),
      district: input.district.trim(),
      subdistrict: input.subdistrict?.trim() ?? null,
      village: input.village?.trim() ?? null,
      careCodeRaw: input.careCodeRaw?.trim() ?? null,
      addressSummary: input.addressSummary?.trim() ?? null,
      latitude: hasCoords ? input.latitude! : null,
      longitude: hasCoords ? input.longitude! : null,
      assignmentStatus: bodyId ? 'assigned' : 'pending_assignment',
      locationStatus: hasCoords ? 'verified' : 'pending_location',
      meetingDayOfWeek: input.meetingDayOfWeek ?? null,
      meetingTimeLocal: input.meetingTimeLocal ?? null,
      targetAttendance: input.targetAttendance ?? 12,
      notes: input.notes ?? null,
    })
    .returning();
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, 'GROUP_CODE_EXISTS', 'มีรหัสกลุ่มนี้อยู่ในระบบแล้ว');
    }
    throw err;
  }

  await recordSecurityAudit(db, {
    actorUserId: actor.user.id,
    action: 'group_created',
    targetType: 'house_mission_group',
    targetId: created!.id,
    metadata: {
      groupCode: created!.groupCode,
      bodyId: created!.bodyId,
      assignmentStatus: created!.assignmentStatus,
      locationStatus: created!.locationStatus,
    },
  });

  return created!;
}

export async function transferGroupToBody(
  db: FaithMapDb,
  actor: ActorContext,
  groupId: string,
  toBodyId: string,
  reason: string
) {
  if (!isAdmin(actor)) {
    throw new AppError(
      403,
      'ADMIN_REQUIRED',
      'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถย้ายสังกัดบอดี้ของกลุ่มพันธกิจได้'
    );
  }
  const [group] = await db
    .select()
    .from(houseMissionGroups)
    .where(eq(houseMissionGroups.id, groupId));
  if (!group) {
    throw new AppError(404, 'GROUP_NOT_FOUND', 'ไม่พบกลุ่มพันธกิจบ้านที่ต้องการย้าย');
  }
  if (group.bodyId === toBodyId) {
    throw new AppError(400, 'SAME_BODY', 'กลุ่มสังกัดบอดี้ปลายทางนี้อยู่แล้ว');
  }
  const [toBody] = await db.select({ id: bodies.id }).from(bodies).where(eq(bodies.id, toBodyId));
  if (!toBody) throw new AppError(404, 'BODY_NOT_FOUND', 'ไม่พบบอดี้ปลายทาง');

  return db.transaction(async (tx) => {
    const tdb = tx as unknown as FaithMapDb;
    const [openPeriod] = await tdb
      .select()
      .from(reportingPeriods)
      .where(eq(reportingPeriods.status, 'open'))
      .limit(1);

    const [updated] = await tdb
      .update(houseMissionGroups)
      .set({ bodyId: toBodyId, assignmentStatus: 'assigned', updatedAt: new Date() })
      .where(eq(houseMissionGroups.id, groupId))
      .returning();

    // Note: Historical period_group_snapshots remain immutable (DEC-08).
    if (group.bodyId) {
      await tdb.insert(groupBodyTransfers).values({
        groupId,
        fromBodyId: group.bodyId,
        toBodyId,
        effectivePeriodId: openPeriod?.id ?? null,
        reason,
        transferredByUserId: actor.user.id,
      });
    }

    await recordSecurityAudit(tdb, {
      actorUserId: actor.user.id,
      action: 'group_transferred_body',
      targetType: 'house_mission_group',
      targetId: groupId,
      reason,
      metadata: { fromBodyId: group.bodyId, toBodyId },
    });

    return updated!;
  });
}

export async function assignLeadershipRole(
  db: FaithMapDb,
  actor: ActorContext,
  input: {
    userId: string;
    scopeType: 'body' | 'group';
    bodyId?: string | null;
    groupId?: string | null;
    roleType: AssignmentRole;
    isPrimary?: boolean;
  }
) {
  if (input.scopeType === 'body') {
    if (!isAdmin(actor)) {
      throw new AppError(
        403,
        'ADMIN_REQUIRED',
        'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถแต่งตั้งหัวหน้าบอดี้ (Body Leader) ได้'
      );
    }
    if (!input.bodyId || input.roleType !== 'body_leader') {
      throw new AppError(400, 'INVALID_ASSIGNMENT', 'บทบาทระดับบอดี้ต้องระบุ bodyId และ roleType=body_leader');
    }
  } else {
    if (!input.groupId) {
      throw new AppError(400, 'INVALID_ASSIGNMENT', 'กรุณาระบุกลุ่มพันธกิจสำหรับบทบาทระดับกลุ่ม');
    }
    if (!['care_leader', 'coordinator', 'group_leader', 'other_authorized'].includes(input.roleType)) {
      throw new AppError(400, 'INVALID_ASSIGNMENT', 'บทบาทระดับกลุ่มไม่ถูกต้อง');
    }
    const [grp] = await db
      .select()
      .from(houseMissionGroups)
      .where(eq(houseMissionGroups.id, input.groupId));
    if (!grp) {
      throw new AppError(404, 'GROUP_NOT_FOUND', 'ไม่พบกลุ่มพันธกิจบ้านที่ระบุ');
    }
    // DEC-09: Body Leader can manage group assignments ONLY within their own Body,
    // and only the roles it lists: group_leader, care_leader, coordinator.
    assertCanManageBodyScope(actor, grp.bodyId);
    if (input.roleType === 'other_authorized' && !isAdmin(actor)) {
      throw new AppError(
        403,
        'ADMIN_REQUIRED',
        'เฉพาะผู้ดูแลระบบเท่านั้นที่มอบหมายบทบาท "ผู้ได้รับมอบหมายอื่น" ได้ (DEC-09)'
      );
    }
  }

  const [targetUser] = await db.select().from(users).where(eq(users.id, input.userId));
  if (!targetUser) {
    throw new AppError(404, 'USER_NOT_FOUND', 'ไม่พบบัญชีผู้ใช้ที่ต้องการมอบหมาย');
  }
  const usable = await isUsableAccount(db, targetUser);
  if (!usable) {
    throw new AppError(
      400,
      'USER_NOT_USABLE',
      'ไม่สามารถมอบหมายบัญชีที่ยังไม่เปิดใช้งานหรือถูกระงับสิทธิ์ (ต้อง active และมีวิธีเข้าสู่ระบบ)'
    );
  }

  const isPrimary = input.isPrimary ?? true;
  const now = new Date();

  return db.transaction(async (tx) => {
    const tdb = tx as unknown as FaithMapDb;

    // Deactivate duplicate active role for same user+scope
    if (input.scopeType === 'body' && input.bodyId) {
      if (isPrimary) {
        await tdb
          .update(assignments)
          .set({
            effectiveTo: now,
            revokedByUserId: actor.user.id,
            revokedReason: 'เปลี่ยนผู้รับผิดชอบหลักระดับบอดี้',
            updatedAt: now,
          })
          .where(
            and(
              eq(assignments.scopeType, 'body'),
              eq(assignments.bodyId, input.bodyId),
              eq(assignments.roleType, input.roleType),
              eq(assignments.isPrimary, true),
              isNull(assignments.effectiveTo)
            )
          );
      }
      await tdb
        .update(assignments)
        .set({
          effectiveTo: now,
          revokedByUserId: actor.user.id,
          revokedReason: 'ปรับปรุงการมอบหมายซ้ำ',
          updatedAt: now,
        })
        .where(
          and(
            eq(assignments.userId, input.userId),
            eq(assignments.bodyId, input.bodyId),
            eq(assignments.roleType, input.roleType),
            isNull(assignments.effectiveTo)
          )
        );
    } else if (input.groupId) {
      if (isPrimary) {
        await tdb
          .update(assignments)
          .set({
            effectiveTo: now,
            revokedByUserId: actor.user.id,
            revokedReason: 'เปลี่ยนผู้รับผิดชอบหลักระดับกลุ่ม',
            updatedAt: now,
          })
          .where(
            and(
              eq(assignments.scopeType, 'group'),
              eq(assignments.groupId, input.groupId),
              eq(assignments.roleType, input.roleType),
              eq(assignments.isPrimary, true),
              isNull(assignments.effectiveTo)
            )
          );
      }
      await tdb
        .update(assignments)
        .set({
          effectiveTo: now,
          revokedByUserId: actor.user.id,
          revokedReason: 'ปรับปรุงการมอบหมายซ้ำ',
          updatedAt: now,
        })
        .where(
          and(
            eq(assignments.userId, input.userId),
            eq(assignments.groupId, input.groupId),
            eq(assignments.roleType, input.roleType),
            isNull(assignments.effectiveTo)
          )
        );
    }

    const [created] = await tdb
      .insert(assignments)
      .values({
        userId: input.userId,
        scopeType: input.scopeType,
        bodyId: input.scopeType === 'body' ? input.bodyId! : null,
        groupId: input.scopeType === 'group' ? input.groupId! : null,
        roleType: input.roleType,
        isPrimary,
        assignedByUserId: actor.user.id,
      })
      .returning();

    await recordSecurityAudit(tdb, {
      actorUserId: actor.user.id,
      action: 'assignment_granted',
      targetType: 'assignment',
      targetId: created!.id,
      metadata: {
        assigneeUserId: input.userId,
        scopeType: input.scopeType,
        bodyId: input.bodyId ?? null,
        groupId: input.groupId ?? null,
        roleType: input.roleType,
      },
    });

    await dispatchNotification(tdb, {
      userId: input.userId,
      category: 'assignment_changed',
      title: `คุณได้รับมอบหมายบทบาท ${input.roleType}`,
      body: `${actor.user.displayName} ได้มอบหมายบทบาทให้คุณในระบบ FaithMap`,
      relatedEntityType: 'assignment',
      relatedEntityId: created!.id,
      dedupeKey: `assign:${created!.id}`,
      sendLine: true,
    });

    return created!;
  });
}

export async function revokeAssignment(
  db: FaithMapDb,
  actor: ActorContext,
  assignmentId: string,
  reason: string
) {
  const [target] = await db.select().from(assignments).where(eq(assignments.id, assignmentId));
  if (!target || target.effectiveTo !== null) {
    throw new AppError(404, 'ASSIGNMENT_NOT_FOUND', 'ไม่พบรายการมอบหมายที่ยังใช้งานอยู่');
  }

  if (target.scopeType === 'body') {
    if (!isAdmin(actor)) {
      throw new AppError(403, 'ADMIN_REQUIRED', 'เฉพาะผู้ดูแลระบบเท่านั้นที่ถอดถอนหัวหน้าบอดี้ได้');
    }
  } else if (target.scopeType === 'group' && target.groupId) {
    const [grp] = await db
      .select()
      .from(houseMissionGroups)
      .where(eq(houseMissionGroups.id, target.groupId));
    if (!grp) {
      throw new AppError(404, 'GROUP_NOT_FOUND', 'ไม่พบกลุ่มพันธกิจ');
    }
    assertCanManageBodyScope(actor, grp.bodyId);
  } else if (target.scopeType === 'care' && target.careId) {
    // Care assignments (Phase 3B) are managed by the Body that owns the care. Unmapped cares: admins only.
    const [care] = await db.select({ bodyId: cares.bodyId }).from(cares).where(eq(cares.id, target.careId));
    assertCanManageBodyScope(actor, care?.bodyId ?? null);
  } else if (!isAdmin(actor)) {
    // Any other kind of assignment: deny unless admin. A missing check here would allow anyone.
    throw new AppError(403, 'ADMIN_REQUIRED', 'ไม่มีสิทธิ์ถอดถอนการมอบหมายประเภทนี้');
  }

  const now = new Date();
  const [updated] = await db
    .update(assignments)
    .set({
      effectiveTo: now,
      revokedByUserId: actor.user.id,
      revokedReason: reason,
      updatedAt: now,
    })
    .where(eq(assignments.id, assignmentId))
    .returning();

  await recordSecurityAudit(db, {
    actorUserId: actor.user.id,
    action: 'assignment_revoked',
    targetType: 'assignment',
    targetId: assignmentId,
    reason,
    metadata: { userId: target.userId, roleType: target.roleType },
  });

  return updated!;
}

export async function listUsersForGovernance(db: FaithMapDb, actor: ActorContext) {
  if (!isAdmin(actor) && actor.bodyLeaderBodyIds.size === 0) {
    throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์ดูรายชื่อผู้ใช้งานในระบบ');
  }
  const allUsers = await db.select().from(users).orderBy(asc(users.username));
  const activeAssignments = await db
    .select()
    .from(assignments)
    .where(isNull(assignments.effectiveTo));
  const extRows = await db
    .select()
    .from(externalIdentities)
    .where(isNull(externalIdentities.revokedAt));
  const passkeyRows = await db
    .select()
    .from(userPasskeys)
    .where(isNull(userPasskeys.revokedAt));

  return allUsers.map((u) => {
    const hasLine = extRows.some((e) => e.userId === u.id);
    const hasPasskey = passkeyRows.some((p) => p.userId === u.id);
    const hasPassword = Boolean(u.passwordHash);
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      email: isAdmin(actor) ? u.email : null,
      phoneE164: isAdmin(actor) ? u.phoneE164 : null,
      systemRole: u.systemRole as SystemRole,
      status: u.status as AccountStatus,
      isUsable: u.status === 'active' && (hasPassword || hasLine || hasPasskey),
      authMethods: {
        password: hasPassword,
        lineOidc: hasLine,
        passkey: hasPasskey,
      },
      activeAssignmentCount: activeAssignments.filter((a) => a.userId === u.id).length,
      lastLoginAt: u.lastLoginAt,
    };
  });
}

export async function updateUserStatusByAdmin(
  db: FaithMapDb,
  actor: ActorContext,
  targetUserId: string,
  nextStatus: AccountStatus,
  reason: string
) {
  if (!isAdmin(actor)) {
    throw new AppError(403, 'ADMIN_REQUIRED', 'เฉพาะผู้ดูแลระบบเท่านั้นที่ปรับสถานะบัญชีผู้ใช้ได้');
  }
  if (actor.user.id === targetUserId && nextStatus !== 'active') {
    throw new AppError(400, 'CANNOT_SUSPEND_SELF', 'ไม่สามารถระงับบัญชีของตนเองได้');
  }

  const [target] = await db.select({ role: users.systemRole }).from(users).where(eq(users.id, targetUserId));
  if (!target) {
    throw new AppError(404, 'USER_NOT_FOUND', 'ไม่พบบัญชีผู้ใช้ที่ต้องการแก้ไข');
  }
  // Admin and super_admin accounts can only be changed by a super_admin.
  // Otherwise an admin could lock out the account that approves new registrations.
  if ((target.role === 'super_admin' || target.role === 'admin') && actor.user.systemRole !== 'super_admin') {
    throw new AppError(
      403,
      'PRIVILEGED_ACCOUNT',
      'เฉพาะผู้ดูแลระบบสูงสุดเท่านั้นที่เปลี่ยนสถานะบัญชีผู้ดูแลระบบได้'
    );
  }

  const [updated] = await db
    .update(users)
    .set({ status: nextStatus, updatedAt: new Date() })
    .where(eq(users.id, targetUserId))
    .returning();

  if (!updated) {
    throw new AppError(404, 'USER_NOT_FOUND', 'ไม่พบบัญชีผู้ใช้ที่ต้องการแก้ไข');
  }

  if (nextStatus !== 'active') {
    await db
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(authSessions.userId, targetUserId), isNull(authSessions.revokedAt)));
  }

  await recordSecurityAudit(db, {
    actorUserId: actor.user.id,
    action: 'user_status_changed',
    targetType: 'user',
    targetId: targetUserId,
    reason,
    metadata: { nextStatus },
  });

  return updated;
}

export type SystemRole = 'super_admin' | 'admin' | 'mission_leader' | 'standard_user';
export type AssignmentRole = 'body_leader' | 'care_leader' | 'coordinator' | 'group_leader' | 'other_authorized';

export interface AssignmentView {
  id: string;
  scopeType: 'body' | 'group';
  bodyId: string | null;
  groupId: string | null;
  bodyName: string | null;
  groupName: string | null;
  roleType: AssignmentRole;
  isPrimary: boolean;
}

export interface ActorPayload {
  user: {
    id: string;
    username: string;
    displayName: string;
    email: string | null;
    phoneE164: string | null;
    systemRole: SystemRole;
    status: string;
    lineUserId: string | null;
  };
  assignments: AssignmentView[];
  bodyLeaderBodyIds: string[];
  groupLeaderGroupIds: string[];
  supervisorGroupIds: string[];
}

export interface DemoAccountOption {
  id: string;
  username: string;
  displayName: string;
  systemRole: SystemRole;
  status: string;
}

export interface CanonicalMetrics {
  activeBodies: number;
  activeGroups: number;
  expectedReports: number;
  submittedReports: number;
  missingReports: number;
  heldMeetings: number;
  confirmedNotHeld: number;
  lateReports: number;
  blockedReports: number;
  periodAttendance: number;
  newVisitors: number;
  returningVisitors: number;
  openFollowUps: number;
}

export interface PeriodRow {
  id: string;
  periodKey: string;
  startDate: string;
  endDate: string;
  deadlineAt: string;
  briefScheduledAt: string;
  status: string;
}

export interface BodyWithLeaders {
  id: string;
  code: string;
  nameTh: string;
  province: string;
  status: string;
  activeGroupCount: number;
  totalGroupCount: number;
  hasEligibleBodyLeader: boolean;
  bodyLeaders: Array<{
    assignmentId: string;
    userId: string;
    displayName: string;
    accountStatus: string;
    isUsable: boolean;
    isPrimary: boolean;
  }>;
}

export interface GroupWithContext {
  id: string;
  groupCode: string;
  bodyId: string | null;
  bodyName: string;
  nameTh: string;
  district: string;
  subdistrict: string | null;
  village?: string | null;
  careCodeRaw?: string | null;
  addressSummary: string | null;
  latitude: number | null;
  longitude: number | null;
  assignmentStatus?: 'assigned' | 'pending_assignment';
  locationStatus?: 'verified' | 'pending_location';
  meetingDayOfWeek: number | null;
  meetingTimeLocal: string | null;
  status: string;
  targetAttendance: number;
  notes: string | null;
  assignments: Array<{
    id: string;
    userId: string;
    displayName: string;
    accountStatus: string;
    roleType: AssignmentRole;
    isPrimary: boolean;
  }>;
  currentReport: {
    reportId: string | null;
    status: string;
    meetingHeld: boolean | null;
    totalAttendees: number;
    isBlocked: boolean;
    blockedReason: string | null;
    isLate: boolean;
    requiresSupervisorReview: boolean;
  };
}

export interface ReportQueueItem {
  id: string;
  periodId: string;
  groupId: string;
  bodyId: string | null;
  groupName: string;
  groupCode: string;
  district: string;
  bodyName: string;
  status: string;
  isDraftHidden: boolean;
  meetingHeld: boolean | null;
  notHeldReason: string | null;
  meetingDate: string | null;
  totalAttendees: number;
  memberAttendees: number;
  newVisitorsCount: number;
  returningVisitorsCount: number;
  childrenCount: number;
  summaryNotes: string | null;
  prayerRequests: string | null;
  careNeedsNotes: string | null;
  isLate: boolean;
  isBlocked: boolean;
  blockedReason: string | null;
  requiresSupervisorReview: boolean;
  submittedByUserId: string | null;
  submittedByName: string | null;
  submittedAt: string | null;
  supervisorReviewedByName: string | null;
  supervisorReviewedAt: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  revisionReason: string | null;
  version: number;
}

export interface MemberView {
  id: string;
  membershipId: string;
  memberCode: string;
  groupId: string;
  groupName: string;
  bodyId: string;
  membershipRole: string;
  fullName: string;
  displayName: string;
  phone: string | null;
  email: string | null;
  lineUserId: string | null;
  membershipStatus: string;
  piiMasked: boolean;
}

export interface VisitorView {
  id: string;
  fullName: string;
  nickname: string | null;
  phone: string | null;
  lineUserId: string | null;
  consentForContact: boolean;
  firstOriginGroupId: string | null;
  originGroupName: string;
  visitCount: number;
  convertedMemberId: string | null;
  piiMasked: boolean;
}

export interface FollowUpView {
  id: string;
  groupId: string;
  groupName: string;
  title: string;
  notes: string | null;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  dueDate: string | null;
}

export interface BriefView {
  id: string;
  periodId: string;
  periodKey: string;
  startDate: string;
  endDate: string;
  generatedAt: string;
  generatedByJob: boolean;
  isImmutable: boolean;
  sectionsJson: Record<string, unknown>;
  metricsJson: CanonicalMetrics;
  /** Q-9: what the API built for this caller. */
  viewScope?: 'organization_detail' | 'organization_aggregate' | 'body';
  viewBodyNames?: string[];
}

export interface NotificationView {
  id: string;
  category: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface GovernanceUserView {
  id: string;
  username: string;
  displayName: string;
  systemRole: SystemRole;
  status: 'pending_activation' | 'active' | 'suspended' | 'revoked';
  isUsable: boolean;
  authMethods: { password: boolean; lineOidc: boolean; passkey: boolean };
  activeAssignmentCount: number;
}

export interface SecurityAuditLogView {
  id: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  outcome: string;
  reason: string | null;
  createdAt: string;
}

export interface WorkspacePayload {
  actor: ActorPayload;
  overview: {
    selectedPeriod: PeriodRow;
    periods: PeriodRow[];
    metrics: CanonicalMetrics;
    bodyBreakdown: Array<{
      bodyId: string;
      bodyCode: string;
      bodyName: string;
      expectedReports: number;
      submittedReports: number;
      approvedReports: number;
      blockedReports: number;
      attendance: number;
    }>;
  };
  bodies: BodyWithLeaders[];
  groups: GroupWithContext[];
  reports: ReportQueueItem[];
  members: MemberView[];
  visitors: VisitorView[];
  followUps: FollowUpView[];
  briefs: BriefView[];
  notifications: NotificationView[];
  governanceUsers: GovernanceUserView[];
  securityLogs: SecurityAuditLogView[];
}

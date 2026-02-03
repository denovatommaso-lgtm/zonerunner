export type GroupMember = {
  userId: string;
  role: GroupRole;
  displayName?: string;
  username?: string;
  areaKm2?: number;
  distanceKm?: number;
  groupRuns?: number;
  level?: number;
};

export type GroupRole = 'owner' | 'leader' | 'admin' | 'member';

export type Group = {
  id: string;
  name: string;
  color: string;
  joinCode?: string;
  ownerId?: string;
  description?: string;
  createdAt?: number;
  members?: GroupMember[];
  allowMemberCasualRuns?: boolean;
  allowMemberOfficialRuns?: boolean;
};

export type GroupMembership = {
  userId: string;
  groupId: string;
  role: GroupRole;
  joinedAt: number;
};

export type GroupStats = {
  groupId: string;
  totalDistanceKm: number;
  totalAreaKm2: number;
  totalRuns: number;
  memberCount: number;
};

export type UserGroupStats = {
  userId: string;
  groupId: string;
  distanceKm: number;
  areaKm2: number;
  runs: number;
};

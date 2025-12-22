export interface AdminOrganization {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logo?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  organizationMembers?: AdminOrganizationMember[];
  invitations?: AdminInvitation[];
}

export interface AdminOrganizationMember {
  id: string;
  userId: string;
  role: string;
  joinedAt: string;
  user?: {
    id: string;
    name?: string;
    email: string;
  };
}

export interface AdminInvitation {
  id: string;
  email: string;
  role?: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

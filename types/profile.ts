export type UserProfile = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

export type AuthState = {
  isAuthenticated: boolean;
  profile: UserProfile | null;
  source: "local-mvp" | "server" | "none";
};

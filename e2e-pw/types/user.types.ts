export interface UserCredentials {
  username: string;
  password: string;
}

export interface AdminUser extends UserCredentials {
  role: 'admin';
}

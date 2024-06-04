import { User } from '@/api/user/userModel';

export const users: User[] = [
  { id: 1, name: 'Alice', email: 'alice@example.com', age: 42, createdAt: new Date(), updatedAt: new Date() },
  { id: 2, name: 'Bob', email: 'bob@example.com', age: 21, createdAt: new Date(), updatedAt: new Date() },
];

export const userRepository = {
  findAllAsync: async (): Promise<User[]> => {
    return users;
  },

  findByIdAsync: async (id: number): Promise<User | null> => {
    return users.find((user) => user.id === id) || null;
  },

  addUserAsync: async (user: User): Promise<User[] | null> => {
    user.createdAt = new Date();
    user.updatedAt = new Date();
    users.unshift(user);
    return users;
  },

  deleteUserAsync: async (id: number): Promise<boolean> => {
    const idx: number = users.findIndex((item: User) => item.id === id);
    if (idx < 0) {
      return false;
    }
    if (idx > -1) {
      users.splice(idx, 1);
    }
    return true;
  },

  deleteAllUserAsync: async (): Promise<User[]> => {
    users.length = 0;
    return users;
  },
};

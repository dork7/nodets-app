import { randomUUID } from 'crypto';

export const genCorrelationId = (_options?: any): string => {
 return randomUUID();
};

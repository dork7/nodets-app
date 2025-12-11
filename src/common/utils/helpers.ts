import { randomUUID } from 'crypto';

export const genCorrelationId = (): string => {
 return randomUUID();
};

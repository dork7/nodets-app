import { logger } from '@/server';

import { userRepository } from './userRepository';

export const updateOrderCountInUser = (data: any) => {
 logger.info(data);
 userRepository.updateOrderCount(data).then((user) => {
  if (!user) {
   logger.error('Cannot update order count in user');
   return;
  }
  logger.info('Order count updated in user');
 });
};

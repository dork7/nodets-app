import { WebClient } from '@slack/web-api';

import { env } from '@/common/utils/envConfig';
import { logger } from '@/server';

import { slackBlocks } from '../data/slackBlocks';

const options = {};
const web = new WebClient(env.SLACK_TOKEN, options);

export const sendSlackMessage = async (
 message: any,
 context: 'ERROR' | 'INFO' = 'ERROR',
 channel: any = env.SLACK_CHANNEL
) => {
 return new Promise(async (resolve, reject) => {
  const channelId = channel;
  let body: any = [];
  try {
   switch (context) {
    case 'ERROR':
     logger.error(message);
     body = slackBlocks.errorBlock(message);
     break;
    case 'INFO':
     logger.info(message);
     body = slackBlocks.infoBlock(message);
     break;
    default:
     break;
   }

   const resp: any = await web.chat.postMessage({
    blocks: [slackBlocks.dividerBlock, slackBlocks.contextBlock(`*${context}*`), slackBlocks.dividerBlock, ...body],
    channel: channelId,
   });
   return resolve(true);
  } catch (error) {
   logger.error(error);
   return resolve(true);
  }
 });
};

const joinSlackChannel = (channel, message = null) => {
 return new Promise(async (resolve, reject) => {
  try {
   const resp = await web.conversations.join({
    channel: channel,
   });
   if (message) {
    await sendSlackMessage(message, channel);
   }
   return resolve(true);
  } catch (error) {
   return resolve(true);
  }
 });
};

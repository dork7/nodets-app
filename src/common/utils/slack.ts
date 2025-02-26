import { WebClient } from '@slack/web-api';

import { env } from '@/common/utils/envConfig';
import { logger } from '@/server';

const options = {};
const web = new WebClient(env.SLACK_TOKEN, options);

export const sendSlackMessage = async (message: any, channel: any = env.SLACK_CHANNEL) => {
 return new Promise(async (resolve, reject) => {
  const channelId = channel || env.SLACK_CHANNEL;
  try {
   const resp: any = await web.chat.postMessage({
    blocks: [
     {
      type: 'rich_text',
      elements: [
       {
        type: 'rich_text_section',
        elements: [
         {
          type: 'text',
          text: 'Error occured',
          style: {
           bold: true,
          },
         },
        ],
       },
       {
        type: 'rich_text_preformatted',
        elements: [
         {
          type: 'text',
          text: message,
         },
        ],
       },
      ],
     },
    ],
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

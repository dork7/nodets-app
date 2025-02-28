const infoBlock = (message: string) => {
 return [
  {
   type: 'rich_text',
   elements: [
    {
     type: 'rich_text_section',
     elements: [
      {
       type: 'emoji',
       name: 'warning',
      },
     ],
    },
   ],
  },
  {
   type: 'rich_text',
   elements: [
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
 ];
};
const dividerBlock = {
 type: 'divider',
};
const contextBlock = (message: string) => {
 return {
  type: 'context',
  elements: [
   {
    type: 'mrkdwn',
    text: message,
   },
  ],
 };
};
const errorBlock = (message: string) => {
 return [
  {
   type: 'rich_text',
   elements: [
    {
     type: 'rich_text_section',
     elements: [
      {
       type: 'emoji',
       name: 'bangbang',
      },
     ],
    },
   ],
  },
  {
   type: 'rich_text',
   elements: [
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
 ];
};
const bugBlock = (message: string) => {
 return [
  {
   type: 'rich_text',
   elements: [
    {
     type: 'rich_text_section',
     elements: [
      {
       type: 'emoji',
       name: 'bug',
      },
     ],
    },
   ],
  },
  {
   type: 'rich_text',
   elements: [
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
 ];
};
const slackBlocks = {
 infoBlock,
 dividerBlock,
 contextBlock,
 errorBlock,
 bugBlock,
};
export { slackBlocks };

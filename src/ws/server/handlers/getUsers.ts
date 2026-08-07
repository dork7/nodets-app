export const name = 'getUser';
export const handler = async (params: any) => {
 const { userId } = params || {};
 return { id: userId, name: 'John Doe' };
};

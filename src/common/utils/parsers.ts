export const parseHeaders = (headers: any) => {
 return Object.keys(headers).map((item: any) => {
  return {
   [item]: Buffer.from(headers[item]).toString(),
  };
 });
};

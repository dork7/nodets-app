let startTime, endTime;

function start() {
 startTime = new Date();
}

function end() {
 endTime = new Date();
 var timeDiff = endTime - startTime; //in ms

 console.log(timeDiff + ' timeDiff in MS');
}

const myHeaders = new Headers();

myHeaders.append('cache-control', 'max-age=2');

const requestOptions = {
 method: 'GET',
 headers: myHeaders,
 redirect: 'follow',
};

(async () => {
 start();
 const res = Array(500)
  .fill(0)
  .map((item) => {
   return fetch('http://localhost:2020/v1/catalogue', requestOptions)
    .then((response) => response.text())
    .then((result) => result);
  });
 const rest = await Promise.all(res);
 console.log('res', rest);

 end();
})();

// const myHeaders = new Headers();
// const requestOptions = {
//  method: 'DELETE',
//  headers: myHeaders,
//  redirect: 'follow',
// };

// return fetch('http://localhost:2020/v1/catalogue', requestOptions)
//  .then((response) => {
//   console.log(response.status)
//   return response.text()
// })
//  .then((result) => console.log(result));

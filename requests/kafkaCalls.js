const myHeaders = new Headers();
myHeaders.append('accept', 'application/json');
myHeaders.append('Content-Type', 'application/json');

const requestOptions = {
 method: 'POST',
 headers: myHeaders,
 redirect: 'follow',
};
let counter = 0;
Array(3)
 .fill(0)
 .forEach((_item, idx) => {
  requestOptions.body = JSON.stringify({
   config: {
    topic: 'file',
    partition: counter,
   },
   data: {
    test: `this is the data ${idx} - ${counter}`,
   },
  });
   counter += 1;
  if (counter > 2) {
   counter = 0;
  }
  fetch('http://localhost:2020/kafka/postMessage', requestOptions)
   .then((response) => response.text())
   .then((result) => {
    console.log(result);
    })
   .catch((error) => console.error(error));
 });

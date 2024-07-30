const myHeaders = new Headers();
myHeaders.append('accept', 'application/json');
myHeaders.append('Content-Type', 'application/json');

const requestOptions = {
 method: 'POST',
 headers: myHeaders,
 redirect: 'follow',
};

Array(10)
 .fill(0)
 .forEach((_item, idx) => {
  requestOptions.body = JSON.stringify({
   topic: 'file',
   data: {
    test: `this is the data ${idx}`,
   },
  });
  fetch('http://localhost:2020/kafka/postMessage', requestOptions)
   .then((response) => response.text())
   .then((result) => console.log(result))
   .catch((error) => console.error(error));
 });

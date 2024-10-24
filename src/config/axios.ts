import axios from 'axios';

// Create an Axios instance
const customAxios = axios.create({
 timeout: 10000, // Request timeout in ms (optional)
 headers: {
  'Content-Type': 'application/json',
  // Add any default headers you need here
 },
});

// Add a response interceptor
customAxios.interceptors.response.use(
 (response) => {
  // Modify or handle the response as needed
  return response;
 },
 (error) => {
  return error;
  // Any status code outside the range of 2xx will trigger this function
  if (error.response) {
   //    console.error('Error headers:', error.response.headers);
  } else if (error.request) {
   // The request was made but no response was received
   //    console.error('No response received:', error.request);
  } else {
   // Something happened in setting up the request that triggered an Error
   //    console.error('Error', error.message);
  }

  // Handle errors based on the status code, message, or other criteria
  return Promise.reject(error);
 }
);

export default customAxios;

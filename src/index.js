import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { Amplify } from 'aws-amplify';
// We NO LONGER import aws-exports

// Build the Amplify configuration object dynamically from environment variables
const amplifyConfig = {
  aws_project_region: process.env.REACT_APP_AWS_REGION,
  aws_appsync_graphqlEndpoint: process.env.REACT_APP_APPSYNC_ENDPOINT,
  aws_appsync_region: process.env.REACT_APP_AWS_REGION,
  aws_appsync_authenticationType: "API_KEY",
  aws_appsync_apiKey: process.env.REACT_APP_APPSYNC_APIKEY
};

// ✅ Configure Amplify once here with the dynamic config
Amplify.configure(amplifyConfig);
console.log("✅ Amplify configured dynamically in index.js");

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
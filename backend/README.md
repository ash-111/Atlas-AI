# Atlas-AI Backend Services

This directory contains the AWS Lambda functions that power the Atlas-AI application. These functions are orchestrated by an Amazon Bedrock Agent to provide a complete news analysis and supply chain impact assessment workflow.

### Architecture Overview

1.  **News Scanner (`news-scanner-lambda`)**: Periodically scans news headlines from NewsAPI. For each relevant article, it invokes the Bedrock Agent to analyze the content.
2.  **Bedrock Agent**: The agent receives the news content. Based on its instructions, it determines if there is a supply chain disruption event. If so, it uses its configured Action Groups to:
    *   **Assess Impact (`impact-assessor-lambda`)**: Checks the incident location against a DynamoDB table of known supply chain routes and hubs to find affected assets.
    *   **Dispatch Notification (`notification-dispatcher-lambda`)**: Geocodes the location using Amazon Location Service and sends a GraphQL mutation to AWS AppSync to create a new incident, which appears on the frontend map in real-time.

---

### Functions

#### 1. `news-scanner-lambda`

-   **Description**: Fetches the latest business and general news articles from NewsAPI. It processes the most recent articles and passes them to the Bedrock Agent for analysis.
-   **File**: `news-scanner-lambda/lambda_function.py`
-   **Required Environment Variables**:
    -   `NEWS_API_KEY`: The API key for accessing newsapi.org.
    -   `AGENT_ID`: The ID of the Bedrock Agent to invoke.
    -   `AGENT_ALIAS_ID`: The alias ID for the Bedrock Agent.

#### 2. `notification-dispatcher-lambda`

-   **Description**: This function is part of a Bedrock Agent Action Group. It takes an event summary and location from the agent, geocodes the location using Amazon Location Service, and creates a new incident record via an AWS AppSync GraphQL mutation.
-   **File**: `notification-dispatcher-lambda/lambda_function.py`
-   **Required Environment Variables**:
    -   `GRAPHQL_ENDPOINT`: The API endpoint URL for the AWS AppSync GraphQL API.
    -   `REGION`: The AWS region where the services are deployed (e.g., `us-east-1`).
    -   `PLACE_INDEX_NAME`: The name of the Amazon Location Service Place Index used for geocoding.

#### 3. `impact-assessor-lambda`

-   **Description**: This function is part of a Bedrock Agent Action Group. It receives a location from the agent and scans a DynamoDB table containing supply chain assets (routes, ports, hubs). It performs a keyword match to identify and return a list of potentially affected assets.
-   **File**: `impact-assessor-lambda/lambda_function.py`
-   **Required Environment Variables**:
    -   `TABLE_NAME`: The name of the DynamoDB table (`SupplyChainAssets`) containing the route and hub data.